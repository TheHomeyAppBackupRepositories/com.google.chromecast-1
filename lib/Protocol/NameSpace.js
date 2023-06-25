'use strict'

const { EventEmitter } = require('events');

module.exports = class NameSpace extends EventEmitter {
    /**
     * 
     * @param {*} send Anonymous function from the connection class to send messages over to the connection
     */
    constructor(send) {
        super();

        this.messages = {};
        this._requestId = 0; //always start with request id 0!
        this.send = send;
    }

    // getter for requestID
    get requestId() { return this._requestId; }

    /**
     * Message handler which emits the received message to all listeners.
     * @param {CastMessage} message Received message
     */
    onMessage(message) {
      //  console.log('Namepsace is receiving', message);
        if (message.payloadType === 0) {
            this.emit('message', JSON.parse(message.payloadUtf8));
        } else this.emit('message', message.payloadBinary);
    };


    /**
     * Send a message on this namespace.
     * @param {} data Data object for the message body
     * @param {*} source The source string
     * @param {*} destination The destination string
     */
    async sendMessage(data, source = 'sender-0', destination = 'receiver-0') {
        const requestId = ++this._requestId;
        data = {
            ...data,
            requestId
        };

        data = JSON.stringify(data);
        //console.log('Namepsace is sending', data);
        return this.send({
            sourceId : source,
            destinationId: destination,
            data
        });
    }
}