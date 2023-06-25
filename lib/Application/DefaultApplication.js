'use strict'

const { EventEmitter } = require('events');

module.exports = class DefaultApplication extends EventEmitter {
    // Since this is the baseclass, the instance should have it's own namespace and app_id.
    static get NAMESPACE() {
        throw new Error('Missing app namespace');
    }

    static get APP_ID() {
        throw new Error('Missing app id');
    }

    constructor(namespace) {
        super();

        // Formatted logging
        this.log = console.log.bind(this, `[Application]`);

        this._namespace = namespace;
        this._namespace.on('message', this.handleMessage.bind(this));

        this._sourceId = 'client-0'; //default sourceId
    }

    /**
     * Getters and settters
     */
    // The generated session id becomes the destination,
    // Generated client id (format 'client-$') will be the source.
    get sessionId() { return this._sessionId; }

    set sessionId(id) { this._sessionId = id; }

    get sourceId() { return this._sourceId; }

    set sourceId(sourceId) { this._sourceId = sourceId; }

    handleMessage(message) {
        // this.log(message);
        if(message.type && message.type === "CLOSE") {
            this.close();
        }
    }

    /**
     * Generic function to send data from the namespace to the connection instance.
     * @param {Object} data Data object to send.
     */
    send(data) {
        const result = this._namespace.sendMessage(data, this._sourceId, this._sessionId);

        const currentClientNumber = parseInt(this._sourceId.split('-')[1]) // "client-22, so [1] will be 22"
        this._sourceId = `client-${currentClientNumber+1}`; //store the client id +1 for the next request

        return result; // return the result from the namespace sendMessage call
    }

    /**
     * Close the Application.
     */
    close() {
        delete this._namespace;
        this.emit('close');
    }

    destroy() {
        this.removeAllListeners();
    }
}