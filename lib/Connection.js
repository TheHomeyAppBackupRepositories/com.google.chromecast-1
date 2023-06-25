'use strict';

const tls = require('tls');
const EventEmitter = require('events');

const Protocol = require('./Protocol/Protocol');
const PacketStreamWrapper = require('./Protocol/PacketStreamWrapper');
const NameSpace = require('./Protocol/NameSpace');

const CastMessage = Protocol.CastMessage;

/**
 * Emits:
 * 'error': when the connection is closed due to an error
 * 'closed: when the remote end has closed the connection
 */

class Connection extends EventEmitter {
    constructor(host, port) {
        super();

        // Formatted logging
        this.log = console.log.bind(this, `[Protocol Connection]`);

        // Remote-end variables
        this._host = host;
        this._port = port || 8009;

        // Socket stuff
        this.socket = null;
        this.ps = null;

        // Keep track of the used namespaces
        this._namespaces = {};
    }

    // Check and send a Message to the correct namespace
    messageToNamespace(message) {
        const namespace = this._namespaces[message.namespace];
        if (namespace) namespace.onMessage(message);
    }

    // Create and register a new namespace. Id is the namespace string like 'urn:x-cast'
    async registerNamespace(id) {
        if (!this._namespaces[id]) {

            // Message from namespace should be an object with sender, destination and data
            const send = (message) => {
                message.namespace = id; // add the namespace to message
                return this.send(message) // Message is the object that has everything so no new object required.
            };

            const newNSP = new NameSpace(send);
            this._namespaces[id] = newNSP;

            return newNSP;
        } else { return this._namespaces[id]; }
    }

    /**
     * Remove a namespace from the connection.
     * @param {String} id The id of the namespace
     */
    removeNamespace(id) {
        if (this._namespaces[id]) delete this._namespaces[id];
    }

    /**
     * Remove all the stored namespaces
     */
    removeAllNamespaces() {
        if (this._namespaces) delete this._namespaces;
    }
    
    /**
     * Function to connect to the Chromecast on given host and port.
     * If no port is given the default port (8009) is used.
     * 
     * Create a tls socket, then attach a PacketStream instance that parses every received packet.
     * This stream can be fed into the protocol conversion to parse from buffer to a Protobuf message.
     */
    async connect() {
        if (this.connection) return this.connection;

        // Inline function to handle and parse incoming packets
        const onpacket = async buf => {
            const message = await CastMessage.parse(buf);
            
            if (message.protocolVersion !== 0) { // CASTV2_1_0
                this.log(`Unsupported protocol version: ${message.protocolVersion}`);
                this.close();
                return;
            }

            // Add payloadtype to the message object.
            (message.payloadType === 1) ? message.payloadBinary : message.payloadUtf8
        
            //this.log('======= Incoming Message =======', message);
            this.messageToNamespace(message);

        };
        
        this.connection = new Promise((resolve) => {
            this.socket = tls.connect({
                host: this._host,
                port: this._port,
                rejectUnauthorized: false
            }, () => {
                if (this.socket) {
                    this.log(`Connecting to ${this._host} @ ${this._port}`);
                    this.ps = new PacketStreamWrapper(this.socket);
                    this.ps.on('packet', onpacket);

                    resolve('connected');
                }
            });
            
            const onerror = (err) => {
                this.log(`Socket error: ${err.message}`);
                // if (err.message.includes('ECONNRESET')) {
                //     this.log('ECONNRESET, trying to reconnect');
                //     return this.connect();
                // } // shouldn't be neccessary anymore since ChromecastDevice handles the reconnection

                this.disconnect();
                this.emit('error', err); // Emit so the device instance can respond
            };

            const onclose = () => {
                this.log('Socket onclose');
                this.disconnect();
                this.emit('closed'); // Emit so the device instance can respond
            };

            // Respond on events from the socket
            this.socket
                .on('error', onerror)
                .once('close', onclose)
        });

        return this.connection;
    }
    
    /**
     * Function to disconnect the connection.
     */
    disconnect() {
        if (this.socket) this.socket.removeAllListeners();
        if (this.ps) this.ps.removeAllListeners();
        
        // using socket.destroy here because socket.end caused stalled connection
        // in case of dongles going brutally down without a chance to FIN/ACK
        if (this.socket) this.socket.destroy();

        //delete this._namespaces;
        Object.values(this._namespaces).forEach(nsp => nsp = null); // keep this._namespaces intact but nullify the objects

        this.socket = null;
        this.ps = null;
        this.connection = null; // remove the connection promise reference.
        this.log(`Connection to ${this._host} closed`);
    }

    /**
     * Method to send a message
     * 
     * @param {CastMessage} message Object with the values to create message from
     */
    
    async send(message) {
        await this.connect();
        if (!this.ps) return new Error('no_packetstreamer');

        message.protocolVersion = 0; // CASTV2_1_0
        
        // Determine which payload type to use
        // Convert load data in the correct field and remove data from message
        if (Buffer.isBuffer(message.data)) {
            message.payloadType = 1; // BINARY
            message.payloadBinary = message.data;
            delete message.data
        } else {
            message.payloadType = 0; // STRING
            message.payloadUtf8 = message.data;
            delete message.data;
        }
        
        // this.log('======= Outgoing Message =======', message);

        const buf = await CastMessage.serialize(message);
        this.ps.send(buf);
    }
}

module.exports = Connection;
