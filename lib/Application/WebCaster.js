'use strict'

const { ATHOM_WEBCAST_APP_ID, ATHOM_WEBCAST_NAMESPACE } = require('../Constants')

const DefaultApplication = require('./DefaultApplication');

module.exports = class WebCaster extends DefaultApplication {
    static get APP_ID() { return ATHOM_WEBCAST_APP_ID; }

    static get NAMESPACE() { return ATHOM_WEBCAST_NAMESPACE; }
    
    /**
     * 
     * @param {String} url URL to send to the Webcaster app. This will be displayed in fullscreen.
     */
    loadURL(url) {
        url = url.trim();
        this.send({ 
            command: "redirect", 
            args: { url }
        });

        // When redirected, the browser part is done and the connection will drop. Return true to resolve the Flow.
        this._namespace.on('message', (msg) => { 
            if (msg.state === 'REDIRECTED') {
                this.emit('close');
                return true;
            }
        });
    }

    /**
     * Since we cannot start the native YouTube app (yet), use the webcaster to display YouTube videos from Homey.
     * 
     * @param {String} videoUrl Either a full url, youtu.be share url or the video id from YouTube.
     */
    loadYouTubeVideo(videoId) {   
        this.send({
            command: 'youtube',
            args: {
                videoId
            }
        })
    }

    loadImage(imageUrl) {
        if (!imageUrl) return new Error('no_image');

        this.send({ 
            command: "image",
            args: { url: imageUrl }
        });

        // When redirected, the browser part is done and the connection will drop. Return true to resolve the Flow.
        this._namespace.on('message', (msg) => { 
            if (msg.state === 'LOADED') {
                this.emit('close');
                return true; 
            }
        });
    }

    loadWebRadio(args) {
        if (!args) return new Error('no_station');

        this.send({ 
            args,
            command: "audio", 
        });

        // When redirected, the browser part is done and the connection will drop. Return true to resolve the Flow.
        this._namespace.on('message', (msg) => { 
            if (msg.state === 'LOADED') {
                this.emit('close');
                return true; 
            }
        });
    }
}
