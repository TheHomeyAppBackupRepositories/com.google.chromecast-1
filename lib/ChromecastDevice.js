'use strict'

const EventEmitter = require('events');
const Connection = require('./Connection');
const Constants = require('./Constants');

const TIMEOUT = 4.5*1000; // 5 seconds timeout which all commands should be using
const CAST_TIMEOUT = 15*1000; // Timeout before rejecting a cast session
const MAX_MISSED_HEARTBEATS = 5; // Max missed heartbeats before disconnecting

module.exports = class ChromecastDevice extends EventEmitter {
    constructor({
        id,
        md,
        fn,
        address,
        port,
    }) {
        super();

        this._id = id;
        this._model = md;
        this._name = fn;
        this._address = address;
        this._port = port;

        // Formatted logging
        this.log = console.log.bind(this, `[ChromecastDevice ${this._name}]`);

        // Session/media variables
        // maybe put those into a object to
        this.currentSessionId = null; // Used to control the current active application
        this.currentMediaSessionId = null; // The mediaSessionId is used to control the playing media
        this.currentPlayPostion = 0;

        // State management variables
        this._missedHeartBeats = 0; // keep track of non-answered heartbeats
        this._reconnectCounter = 0;

        // this._connection = new Connection(address, port);

        this.log(`Created ChromecastDevice ${this._name} @ ${this._address}`);
    }

    /*
     * Getters & setters
     */

    get name() { return this._name; }

    get id() { return this._id; }

    get address() { return this._address || null; }

    get model() { return this._model; }

    set address(address) { this._address = address; }

    /**
     * Method to open the connection to the Chromecast itself, then create the necessary namespaces on it.
     */
    async connect() {
        this._connected = this._connected || Promise.resolve().then(async () => {
            this._connection = new Connection(this._address, this._port);
            // Connection eventlistener for closed events
            this._connection.on('error', this.dropConnection.bind(this));
            this._connection.on('closed', this.dropConnection.bind(this));

            await this._connection.connect();

            // Protocol namespaces 
            this.connectionNamespace = await this._connection.registerNamespace(Constants.CONNECTION_NAMESPACE);
            this.heartBeatNamespace = await this._connection.registerNamespace(Constants.HEARTBEAT_NAMESPACE);
            // Application-ish namespaces
            this.receiverNamespace = await this._connection.registerNamespace(Constants.RECEIVER_NAMESPACE);
            this.mediaNamespace = await this._connection.registerNamespace(Constants.MEDIA_NAMESPACE);
            this.webcastNameSpace = await this._connection.registerNamespace(Constants.ATHOM_WEBCAST_NAMESPACE);

            // Send a connect message to let the Chromecast know we want to do stuff
            this.connectionNamespace.sendMessage({ type: "CONNECT" });
            // Start the heartbeat so the connections stays open
            this.startHeartBeat();

            this.receiverNamespace.sendMessage({ type: "CONNECT" });

            // Default namespace message listeners
            this.connectionNamespace.on('message', (msg) => { this.log(Constants.CONNECTION_NAMESPACE, msg); });
            this.heartBeatNamespace.on('message', (msg) => this.handleHeartbeatMessage(msg));
            this.receiverNamespace.on('message', (msg) => this.handleReceiverMessage(msg));
            this.mediaNamespace.on('message', (msg) => { this.handleMediaMessage(msg) });

            this.log('Connected');
            this.emit('connected');
        });

        return this._connected;
    }

    /**
     * Function to call when the connection is dropped outside of Homey.
     * @param {String} err Error message from the connection
     */
    dropConnection(err) {
        this.log('Connection dropped in device', err);
        // Disconnect initated from Chromecast or connection side

        // Always try to close the remainder of the connection
        // if (this._connection) this._connection.disconnect();
        this.stopHeartBeat();
        // All namespaces in the connection are already destroyed

        this._missedHeartBeats = 0;
        this._connected = null;

        this.reconnect(60*1000);

        this.emit('connection_closed', err);
    }

    /**
     * Closed function. Something somewhere errored and the current state cannot be reused.
     * Hence remove all created objects by the this.connect method.
     */
    closeConnection() {
        // Disconnect initated from Homey side. This one should be not reconnected since it's intentionally.
        this.log('Closing connection...');
        this._connection.disconnect();
        this.stopHeartBeat();

        this._missedHeartBeats = 0;
        //this._address = null; // By making address null, a reconnection will always trigger in UpdateIPAddress
        this._connected = null;
        this._connection = null;

        this.currentSessionId = null;
        this.currentMediaSessionId = null;

        this.emit('connection_closed');
        return true;
    }

    /**
     * 
     * @param {Integer} delay Time in ms to wait before reopening the connection. Defaults to 10 seconds
     */
    async reconnect(delay = 10*1000) {
        if ((!this._connected) && (this._reconnectCounter <= 3)) {
            ++this._reconnectCounter;
            this.log(`Reconnecting in ${delay}ms`);
            setTimeout(async () => {
                this.log(`Trying to reconnect to ${this._address}`);
                await this.connect(); // If it fails, it will trigger another reconnect call
                this.log(`Reconnection done in ${this._reconnectCounter} tries`);
            }, delay);
        } else {
            // IP address should be changed by now
            this._address = null;
            return new Error('too_many_reconnects');
        }
    }

    /**
     * 
     * @param {String} ipAddress The new IP address to store and re-connect to
     */
    async updateIPAddress(ipAddress) {
        if (ipAddress !== this._address && ipAddress !== null) {
            this.log('Setting new IP address in device to', ipAddress);
            this._address = ipAddress;
            if (this._connection) await this._connection.disconnect();

            this._connection = null;

            setTimeout(async () => { await this.connect(); }, 10*1000);
        } else {
            this.log(`Cannot set new IP ${ipAddress}!`);
        }
    }

    /**
     * Send the heartbeat message over the open connection.
     * Keep track of unanswered heartbeats. If there are more then 3, the chromecast is likely down.
     * The connection will then be dropped.
     */
    sendHeartBeat() { 
        if (this._missedHeartBeats >= MAX_MISSED_HEARTBEATS) { 
            this.log('Too many unanswered heartbeats');
            this.dropConnection('heartbeats');
            return new Error('too_many_unanswered_heartbeats');
        }
        ++this._missedHeartBeats; // as long as no response is received it is a missed hearbeat
        return this.heartBeatNamespace.sendMessage({ type: "PING" });
    }

    /**
     * Function to start the heartbeat. Sends a PING message on the set interval.
     */
    startHeartBeat() {
        if (this._heartBeatInterval) { clearInterval(this._heartBeatInterval); }

        this.sendHeartBeat();
        this._heartBeatInterval = setInterval(this.sendHeartBeat.bind(this), TIMEOUT);
        setTimeout(() => {
            this.sendHeartBeat();
        }, 200);
    }

    /**
     * Function to stop sending hearbeat messages
     */
    stopHeartBeat() {
        if (this._heartBeatInterval) { clearInterval(this._heartBeatInterval); }
        this._heartBeatInterval = null;
    }

    // Functions to handle messages from the namespaces

    /**
     * Function to handle messages from the heartbeat namespace.
     * If a PONG is received, the missed heartbeat counter is reset.
     * @param {CastMessage} message Message from the Chromecast
     */
    handleHeartbeatMessage(message) {
        // this.log(HEARTBEAT_NAMESPACE, message);
        if (message.type !== "PONG") { this.log(Constants.HEARTBEAT_NAMESPACE, message); }
        if (message.type === "PONG") { this._missedHeartBeats = 0; }
    }

    /**
     * Function to handle message from the receiver namespace.
     * Thins function is used to respond on status updates which contains information about running applications,
     * current volume status and other information about the Chromecast.
     * @param {CastMessage} message Message from the Chromecast
     */
    handleReceiverMessage(message) {
        if (message.type === 'RECEIVER_STATUS') {
            // this.log('RECEIVER_STATUS', message);
            if (message.status.applications) {
                message.status.applications.forEach(async app => {
                    // Always store the most recent session sessionId
                    this.currentSessionId = app.sessionId;

                    // this.log(app);
                    this.emit('application', {
                        id: app.appId,
                        name: app.displayName,
                    });
                    this.log(`Running application ${app.displayName}`);

                    if (app.displayName === 'Backdrop') {
                        this.emit('media_info', { 
                            title: 'Idle',
                            subtitle: '',
                            image: 'default',
                        });
                    }
                    if (app.statusText) {
                        this.emit('media_info', { 
                            title: app.statusText,
                            subtitle: app.displayName,
                            image: app.iconUrl || null,
                        });
                    }

                    // Media status
                    try {
                        if (!app.namespaces) return;
                        if (app.namespaces.find(item => item.name === Constants.MEDIA_NAMESPACE)) {
                            this.log(`${app.displayName} uses media namespace`);
                            this.connectionNamespace.sendMessage({
                                type: "CONNECT"
                            }, `client-${message.requestId}`, app.sessionId);

                            // We need a mediaSessionId to create a valid request
                            if (this.currentMediaSessionId) {
                                this.mediaNamespace.sendMessage({
                                    mediaSessionId: this.currentMediaSessionId,
                                    type: "GET_STATUS"
                                }, `client-${message.requestId}`, app.sessionId);
                            }
                        }
                    } catch (err) { console.log(err) }
                });
            }
            if (message.status.volume) { this.emit('volume', message.status.volume); }
        }
    }

    /**
     * Function to handle messages from the media namespace.
     * If there is a media_status message, parse it and emit the found media information
     * @param {CastMessage} message Message from the Chromecast
     */
    handleMediaMessage(message) {
        if (message.type === 'MEDIA_STATUS') {
            message.status.forEach(statusObject => {

                // Generic media information, like session and playerstate
                this.currentMediaSessionId = statusObject.mediaSessionId ? statusObject.mediaSessionId : null;
                this.currentPlayPostion = statusObject.currentTime ? statusObject.currentTime : null;
                this.emit('playerstate', statusObject.playerState);

                // Media metadata information
                if (statusObject.media) { 
                    const sourceMetaData = statusObject.media.metadata; // to make the code below more clear
                    if (sourceMetaData) {
                        let mediaObject = {};
                        mediaObject.title = sourceMetaData.hasOwnProperty('title') ? sourceMetaData.title : null;
                        mediaObject.subtitle = sourceMetaData.hasOwnProperty('subtitle') ? sourceMetaData.title : null;
                        if (!mediaObject.subtitle) { 
                            mediaObject.subtitle = sourceMetaData.hasOwnProperty('artist') ? sourceMetaData.artist : null;
                        }
                        mediaObject.album = sourceMetaData.hasOwnProperty('album') ? sourceMetaData.album : null;

                        if (statusObject.media.metadata.hasOwnProperty('images')) {
                            if (statusObject.media.metadata.images.hasOwnProperty('url')) {
                                mediaObject.image = statusObject.media.metadata.images.url;
                            } else if (statusObject.media.metadata.images[0].hasOwnProperty('url')) {
                                mediaObject.image = statusObject.media.metadata.images[0].url;
                            } else { mediaObject.image = null; }
                        }
                        
                        this.emit('media_info', mediaObject);
                    } // else no mediadata to emit
                }
            });
        }
    }

    /**
     * Chromecast device tasks
     */

     // Return the device status object, or reject if the chromecast doesn't respond within 5 seconds
    async getStatus() {
        await this.connect();
        this.receiverNamespace.sendMessage({ type: "GET_STATUS" });
        return Promise.race([
            new Promise((resolve, reject) => { 
                this.receiverNamespace.on('message', (msg) => {
                    if (msg.status) resolve(msg.status);
                });
            }),
            new Promise((resolve, reject) => {
                setTimeout(() => {
                    reject(new Error('Timeout'));
                }, TIMEOUT);
            })
        ]);
    }

    async stopCast() {
        await this.connect();
        await this.getStatus();
        this.log('Stopping session', this.currentMediaSessionId);

        return this.receiverNamespace.sendMessage({
            type: "STOP",
            sessionId: this.currentSessionId,
        });
    }

    /**
     * Function to start a application on the Chromecast.
     * It requests the launch of the application, then waits for a response message to obtain the sessionId.
     * After the response the application instance is created and all gathered information is set on the instance.
     * @param {DefaultApplication} DefaultApplication Interface of the application to start.
     */
    async startApp(DefaultApplication) {
        await this.connect();
        
        //use the receiver namespace to launch the app
        await this.receiverNamespace.sendMessage({
            type: "LAUNCH",
            appId: DefaultApplication.APP_ID
        });

        // Then wait until a response arrives on the receivernamespace.
        // If it contains a application array, parse it and search for our launched appid.
        return Promise.race([
            new Promise((resolve, reject) => { 
                const respondOnConnect = (message) => {
                    const sourceId = `client-${message.requestId}`;
                    if (message.status) {
                        if (message.status.applications) {
                            message.status.applications.forEach(async app => {
                                if (app.appId === DefaultApplication.APP_ID) {
                                    // Send the connect request for the application
                                    this.connectionNamespace.sendMessage({
                                        type: "CONNECT"
                                    }, sourceId, app.sessionId);

                                    // Make and use a namespace
                                    const namespace = await this._connection.registerNamespace(DefaultApplication.NAMESPACE);
                                    const launchedApp = new DefaultApplication(namespace);

                                    //Set the source and destination id o be used in the application.
                                    launchedApp.sessionId = app.sessionId;
                                    launchedApp.sourceId = sourceId;

                                    // Since we now have a launched and connected application,
                                    // there is no need to respond to messages anymore in this context
                                    this.receiverNamespace.removeListener('message', respondOnConnect);

                                    // Log to the console what has been started
                                    this.log(`Started ${DefaultApplication.NAMESPACE} from Homey`);

                                    resolve(launchedApp);
                                }
                            });
                        }
                    }
                }
                this.receiverNamespace.on('message', respondOnConnect);
            }),
            new Promise((resolve, reject) => {
                setTimeout(() => {
                    reject(new Error('Timeout'));
                }, CAST_TIMEOUT);
            })
        ]);
    }

    // Media playback

    /**
     * Function to control media playback
     * @param {String} cmd Command to execute. Supported cmd's: https://developers.google.com/cast/docs/reference/receiver/cast.receiver.media#.Command
     */
    mediaPlaybackControl(cmd) {
        if (!this.currentSessionId) return new Error('no_session');
        this.log('Sending media command', cmd);

        this.connectionNamespace.sendMessage({ type: "CONNECT" },
        'client-133700', this.currentSessionId);

        if (cmd === 'QUEUE_NEXT' || cmd === 'QUEUE_PREV') {
            return this.mediaNamespace.sendMessage({
                mediaSessionId: this.currentMediaSessionId,
                type: 'QUEUE_UPDATE',
                jump: cmd === 'QUEUE_NEXT' ? 1 : -1
            }, 'client-133700', this.currentSessionId);
        } else {
            return this.mediaNamespace.sendMessage({
                mediaSessionId: this.currentMediaSessionId,
                type: cmd,
            }, 'client-133700', this.currentSessionId);
        }
    }

    /**
     * Set the volume on the Chromecast
     * @param {Double} volume 
     */
    async setVolume(volume) {
        await this.connect();
        return this.receiverNamespace.sendMessage({
            type: "SET_VOLUME",
            volume: {
                controlType: 'attenuation',
                level: volume
            }
        });
    }

    /**
     * Toggle mute on the Chromecast
     * @param {Boolean} muteState 
     */
    async setMute(muteState) {
        await this.connect();
        return this.receiverNamespace.sendMessage({
            type: "SET_VOLUME",
            volume: { 
                muted: muteState
            }
        });
    }
}
