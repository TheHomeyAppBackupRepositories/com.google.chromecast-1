'use strict';

const EventEmitter = require('events');

const WAITING_HEADER = 0;
const WAITING_PACKET = 1;

class PacketStreamWrapper extends EventEmitter {
  /**
  *
  * @param {*} stream : Stream coming from the socket.
  */
  constructor(stream) {
    super();
    
    // Bind the incoming stream to the this context.
    this.stream = stream;
    
    // Variable to decide whether to parse a header or a packet
    let state = WAITING_HEADER;
    let packetLength = 0;
    
    // Respond to readable data coming from the stream.
    this.stream.on('readable', () => {
      while (true) {
        switch (state) {
          case WAITING_HEADER: {
            const header = stream.read(4);
            if (header === null) return;
            packetLength = header.readUInt32BE(0);
            // When the header is parsed, switch to the packet.
            state = WAITING_PACKET;
            break;
          }
          case WAITING_PACKET: {
            const packet = stream.read(packetLength);
            if (packet === null) return;
            this.emit('packet', packet);
            // When the packet is parsed, switch back to a header
            state = WAITING_HEADER;
            break;
          }
          default:
          break;
        }
      }
    });
  }
  
  /**
  *
  * @param {} buf : The buffer to send to the stream
  */
  send(buf) {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(buf.length, 0);
    this.stream.write(Buffer.concat([header, buf]));
  }
}

module.exports = PacketStreamWrapper;
