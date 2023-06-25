'use strict';

const ProtoBuf = require('protobufjs');
const path = require('path');

// Different messages from the protocol
const messages = [
  'CastMessage',
  'AuthChallenge',
  'AuthResponse',
  'AuthError',
  'DeviceAuthMessage',
];

// Create a parser with the protobuf description.
const parser = ProtoBuf.load(path.join(__dirname, 'cast_channel.proto'));

// Export serialize and parse functions for every message type.
messages.forEach((message) => {
  module.exports[message] = {
    serialize: async (data) => {
      // Load the appropriate message type from the protobuf
      const messageType = (await parser).lookupType(`cast_channel.${message}`);

      // Verify if the given data can be converted to a correct message
      const err = messageType.verify(data);
      // if not, throw the error
      if (err) throw err;

      // Create a message from the data
      const msg = messageType.fromObject(data);
      // Convert the message to a buffer
      const buf = messageType.encode(msg).finish();
      return buf;
    },
    parse: async (buffer) => {
      // Create a message from the given buffer (stream).
      const msg = (await parser).lookupType(`cast_channel.${message}`).decode(buffer);
      return msg;
    },
  };
});