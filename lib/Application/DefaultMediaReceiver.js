'use strict'

const DefaultApplication = require('./DefaultApplication');
const fetch = require('node-fetch');

// Defaultmediareceiver messages
// https://developers.google.com/cast/docs/reference/messages

// Array with supported media types. This is used to check if the provided media is supported by the Chromecast.
const supportedMediaTypes = [
    'video/mp4',
    'video/webm',
    'audio/mp4',
    'audio/mp3',
    'audio/mpeg',
    'image/jpeg',
    'image/png'
]

module.exports = class DefaultMediaReceiver extends DefaultApplication {
    static get APP_ID() { return 'CC1AD845'; }

    static get NAMESPACE() { return 'urn:x-cast:com.google.cast.media'; }

    constructor(...props) {
        super(...props);

    }

    /**
     * Override the default message handler from DefaultApplication
     * @param {*} message The received message that should be parsed.
     */
    handleMessage(message) {
        // this.log(message);
        if (message.type && message.type === "CLOSE") { this.close(); }
    }

    /**
     * Function to obtain the content-type from a given URL. Used for Video, Pictures and Audio casting.
     * @param {*} url 
     */
    async getContentType(url) {
        return new Promise(async (resolve, reject) => {
            await fetch(url, { method: 'HEAD' })
            .then(res => {
                if (res.status === 200) { // http ok
                    const result = res.headers.get('content-type');
                    if (result !== undefined) resolve(result);
                } else { reject(); }
            })
        })
    }

    /**
     * Function to cast supported media. The media type is determined by fetching the contenttype of the URL.
     * @param {string} url http URL to load
     * @param {boolean} repeat whether the loaded media will be repeated, defaults to false
     */
    async castMedia(url, repeat) {
        url = url.trim();
        if (!url.startsWith('http')) return new Error('incorrect_url');
        
        // Get the content type and check if it's supported.
        const contentType = await this.getContentType(url);
        if (!supportedMediaTypes.includes(contentType)) return new Error('Unsupported media type');

        // Build the data object
        const media = {
            contentType,
            contentId: url,
            streamType: 'BUFFERED' // URL so always buffered
        }
        // Set the repeatmode
        const repeatMode = repeat ? "REPEAT_ON" : "REPEAT_OFF";

        // Send the request
        return this.send({ 
                media,
                repeatMode,
                type: "LOAD",
                autoplay: "TRUE",
                currentTime: 0,
            }
        );
    }
}
