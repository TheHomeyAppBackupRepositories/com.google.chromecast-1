'use strict';

const path = require('path');
const Homey = require('homey');
const url = require('url');
const querystring = require('querystring');

const ChromecastDevice = require('./ChromecastDevice');
// Applications
const AthomWebCast = require('./Application/WebCaster');
const MediaCast = require('./Application/DefaultMediaReceiver');

const fetch = require('node-fetch'); // to fetch the albumart

module.exports = class GenericChromecastDevice extends Homey.Device {
  
    static get DEFAULT_IMAGE_PATH() {
      return path.join(__dirname, '..', 'assets', 'images', 'default.png');
    }
  
    async onInit() {
        this.setUnavailable(this.homey.__('searching_chromecast'));

        const data = this.getData();

        this.id = data.id;
        this.model = data.model; // used to determine what can be casted

        this._runningApplication = null;

        // Albumart stuff
        this.image = await this.homey.images.createImage();
        this.image.setPath(this.constructor.DEFAULT_IMAGE_PATH);

        this.homey.setTimeout(() => {
            this.setAlbumArtImage(this.image).catch(this.error);
        }, 5000);

        this._currentImageURL = null;
        this.onGetAlbumArtStream = this.onGetAlbumArtStream.bind(this);

        // Register capability listeners
        if (this.hasCapability('speaker_playing')) { this.registerCapabilityListener('speaker_playing', this.mediaControl.bind(this)); }
        if (this.hasCapability('volume_set')) { this.registerCapabilityListener('volume_set', this.onVolumeSet.bind(this)); }
        if (this.hasCapability('volume_mute')) { this.registerCapabilityListener('volume_mute', this.onVolumeMute.bind(this)); }
        if (this.hasCapability('speaker_next')) { this.registerCapabilityListener('speaker_next', this.onMediaNext.bind(this)); }
        if (this.hasCapability('speaker_prev')) { this.registerCapabilityListener('speaker_prev', this.onMediaPrev.bind(this)); }
    }

    // Discovery function handlers.
    onDiscoveryResult(discoveryResult) {
        this.log('Discovery result', discoveryResult.txt.fn);
        return discoveryResult.txt.id === this.id;
    } 

    async onDiscoveryAvailable(discoveryResult) {
        this._chromecastDevice = new ChromecastDevice({
            id: discoveryResult.txt.id,
            md: discoveryResult.txt.md,
            fn: discoveryResult.txt.fn,
            address: discoveryResult.address,
            port: discoveryResult.port,
        });

        setTimeout(async () => {
            await this._chromecastDevice.connect(); // When this throws, the device will become unavailable.
            this._chromecastDevice.getStatus();

            this._chromecastDevice
                .on('connected', () => { this.setAvailable() })
                .on('connection_closed', () => { 
                    this.setCapabilityValue('speaker_playing', false);
                    this.setUnavailable(this.homey.__('connection_closed'));
                 })
                .on('application', this.setApplication.bind(this))
                .on('media_info', this.changeMediaStatus.bind(this))
                .on('playerstate', this.changePlayerState.bind(this))
                .on('volume', this.changeVolume.bind(this))
        }, 10*1000);
    }

    onDiscoveryAddressChanged(discoveryResult) {
        // Update your connection details here
        this.log('onDiscoveryAddressChanged');
        this._chromecastDevice.updateIPAddress(discoveryResult.address);
    }

    onDiscoveryLastSeenChanged(discoveryResult) {
        // When the device was offline, try to reconnect here
        this.log('onDiscoveryLastSeenChanged');
        this._chromecastDevice.updateIPAddress(discoveryResult.address);
    }

    /**
     * Correctly handle deletion events from Homey
     */
    onDeleted() {
        this.log('Deleting chromecastdevice instance');
        if (this._chromecastDevice) {
            this._chromecastDevice.closeConnection();
            this._chromecastDevice = null;
        }
    }

    _closeWebCaster() {
        if (this._athomWebCaster) this._athomWebCaster.destroy();
        delete this._athomWebCaster;
        this.log('Webcaster closed');
    }

    // Cast methods

    /**
     * Cast a URL through the Athom webcaster application
     * @param {String} url URL to cast
     */
    async castURL(url) {
        if (!this._chromecastDevice) return;
        url = url.trim();
        if (!url.startsWith('http')) {
            url = `https://${url}`
        }

        // Bind the webcaster to the this context since it can be reused later on
        //if (!this._athomWebCaster) { this._athomWebCaster = await this.chromeCastDevice.startApp(AthomWebCast); }
        this._athomWebCaster = await this._chromecastDevice.startApp(AthomWebCast);
        this._athomWebCaster.on('close', this._closeWebCaster);
        
        return this._athomWebCaster.loadURL(url);
    }

    /**
     * Cast a YouTube video through the Athom webcast application
     * @param {String} videoString YouTube video string, either URL or ID
     */
    async castYouTube(videoString) {
        if (this.model === 'Google Home Mini') return new Error("Cannot cast YouTube to this device.");
        if(!this._chromecastDevice) return;

        // Change to the chromecast youtube app if we have it working
        //if (!this._athomWebCaster) { this._athomWebCaster = await this.chromeCastDevice.startApp(AthomWebCast); }
        this._athomWebCaster = await this._chromecastDevice.startApp(AthomWebCast);
        this._athomWebCaster.on('close', this._closeWebCaster);

        let videoId;
        const urlResult = url.parse(videoString.trim());
        if (urlResult.host === 'youtu.be') videoId = urlResult.pathname.replace('/', '');
        else if (urlResult.query) {
            const params = querystring.parse(urlResult.query);
            if (params.v) videoId = params.v;
        }
        else {
            if (videoUrl.length >= 10) videoId = videoUrl;
            else return new Error('invalid_youtube_video');
        }

        // Since the webcaster is not able to send media info, set it internally
        this.changeMediaStatus({
            title: 'Youtube',
            subtitle: '',
            image: `https://img.youtube.com/vi/${videoId}/1.jpg`,
        });
        this.changePlayerState("PLAYING");


        return this._athomWebCaster.loadYouTubeVideo(videoId);
    }

    /**
     * Cast a picture URL through the Athom webcaster application
     * @param {String} imageURL URL with image to cast
     */
    async castImage(imageURL) {
        if (!this._chromecastDevice) return;
        // Bind the webcaster to the this context since it can be reused later on
        //if (!this._athomWebCaster) { this._athomWebCaster = await this._chromecastDevice.startApp(AthomWebCast); }
        this._athomWebCaster = await this._chromecastDevice.startApp(AthomWebCast);
        this._athomWebCaster.on('close', this._closeWebCaster);

        return this._athomWebCaster.loadImage(imageURL);
    }

     /**
     * Single function to send media through the default media receiver.
     * The app instance will handle the content type.
     * @param {String} url URL with media to load
     */
    async castMedia(url, repeat){
        if(!this._chromecastDevice) return;

        this._defaultMediaReceiver = await this._chromecastDevice.startApp(MediaCast);
        return this._defaultMediaReceiver.castMedia(url, repeat);
    }

    /**
     * Cast a TuneIn Radio stream through the Athom webcaster application
     * @param {String} station TuneIn Station information
     */
    async castTuneInRadio(station) {
        if (!this._chromecastDevice) return;
        if (!station) return new Error('no_station');

        const query = await fetch(`https://opml.tunein.com/Tune.ashx?id=${station.id}&render=json`).catch(err => console.log('could not fetch: ', err));
        const json = await query.json().catch(err => console.log('No json: ', err));

        this._athomWebCaster = await this._chromecastDevice.startApp(AthomWebCast);
        this._athomWebCaster.on('close', this._closeWebCaster);
        
        const result = await this._athomWebCaster.loadWebRadio({
            title: station.name,
            audioUrl: json.body[0].url,
            imageUrl: station.image,
        });

        // Since the webcaster is not able to send media info, set it internally
        this.changeMediaStatus({
            title: station.name,
            subtitle: '',
            image: station.image.replace("http://","https://"),
        })
        this.changePlayerState("PLAYING");

        return result;
    }

    async castWebRadio(station) {
        if (!this._chromecastDevice) return;
        if (!station) return new Error('no_station');

        const query = await fetch(`http://de1.api.radio-browser.info/json/stations/byuuid/${station.id}`).catch(err => console.log('The radio could not be found: ', err));
        const json = await query.json().catch(err => console.log('No json: ', err));

        this._athomWebCaster = await this._chromecastDevice.startApp(AthomWebCast);
        this._athomWebCaster.on('close', this._closeWebCaster);
        
        const result = await this._athomWebCaster.loadWebRadio({
            title: station.name,
            audioUrl: json[0].url,
            imageUrl: json[0].favicon,
        });

        // Since the webcaster is not able to send media info, set it internally
        this.changeMediaStatus({
            title: station.name,
            subtitle: '',
            image: json[0].favicon.replace("http://","https://"),
        });
        this.changePlayerState("PLAYING");

        return result;
    }
 
    /**
     * Function to stop any running application and go back to the backdrop.
     * Works with all applications, even if not launched from Homey.
     */
    async stopCast() {
        if(!this._chromecastDevice) return;

        return this._chromecastDevice.stopCast();
    }

    setApplication(application) {
        // application format { id: 233637DE, name: 'YouTube' }
        if (this._runningApplication) {
            if (application.id === this._runningApplication.id) return; // Nothing to update if this app was already running
        }
        this._runningApplication = application;
        
        // Trigger the start/stopped flows based on the launched aps. This may be overwritten by the PlayerState
        if (application.id === 'E8C28D3C') {
            this.driver.triggerCastStopped(this);
            this.setCapabilityValue('speaker_playing', false);
        }
        else {
            this.driver.triggerCastStarted(this, undefined, { app_name: application.name });
            this.setCapabilityValue('speaker_playing', true);
        }

        // Update the knowapps in settings
        var knownApps = this.homey.settings.get('applications');

        if (!knownApps) { // no apps stored so create a object and append the data
            knownApps = { [application.id] : application.name, }
        } else if (!knownApps.hasOwnProperty(application.id)) {
            knownApps[application.id] = application.name;
        }

        this.homey.settings.set('applications', knownApps);
    }

    // Capability methods

    /**
     * 
     * @param {Object} mediaInfo The status information to load in the media information.
     */
    changeMediaStatus(mediaInfo) {
        if (!mediaInfo) return;

        this.currentMediaInfo = mediaInfo;

        if (this.hasCapability('speaker_track')) { this.setCapabilityValue('speaker_track', mediaInfo.title); }
        if (this.hasCapability('speaker_artist')) { this.setCapabilityValue('speaker_artist', mediaInfo.subtitle); }
        if (this.hasCapability('speaker_album')) { this.setCapabilityValue('speaker_album', mediaInfo.album || ''); }

        if (mediaInfo.image && mediaInfo.image !== this._currentImageURL) {
            if (mediaInfo.image === 'default') { this.image.setPath(this.constructor.DEFAULT_IMAGE_PATH); }
            else {
                if (typeof mediaInfo.image === 'string') {
                    if (mediaInfo.image.startsWith('https')) { this.image.setUrl(mediaInfo.image); }
                    else if (mediaInfo.image.startsWith('http')) {
                        this.imageURL = mediaInfo.image;
                        this.image.setStream(this.onGetAlbumArtStream) 
                    }
                }
            }
            this.image.update()
                .catch(error => this.log('image error', error));
            this.setAlbumArtImage(this.image)
                .catch(error => this.log('image error', error));
            this._currentImageURL = mediaInfo.image;
        }
    }

    async onGetAlbumArtStream(stream) {
        if(!this.imageUrl)
          throw new Error('Missing Image URL');
        
        const res = await fetch(this.imageUrl);
        if(!res.ok)
          throw new Error('Invalid Response');
        return res.body.pipe(stream);
    }

    /**
     * Changes the Homey playing capability accordingly to the player state of the Chromecast.
     * 
     * @param {String} playerState The playerState from Chromecast.
     */
    changePlayerState(playerState) {
        if (this.hasCapability('speaker_playing') && playerState) {
            switch(playerState) {
                case 'IDLE':
                    this.setCapabilityValue('speaker_playing', false);
                    break;
                case 'PAUSED':
                    this.setCapabilityValue('speaker_playing', false);
                    // this.driver.triggerCastStopped(this, undefined, { app_name: this._runningApplication.name });
                    break;
                case 'PLAYING':
                    this.setCapabilityValue('speaker_playing', true);
                    // this.driver.triggerCastStarted(this, undefined, { app_name:this._runningApplication.name });
                    break;
            }
        }
    }

    /**
     * Changes the volume when it changes on the Chromecast
     * 
     * @param {Object} volumeObject Object with double volume and boolean mute
     */
    changeVolume(volumeObject) {
        // Volumeobject is the object directly how it was received from the Chromecast
        if (this.hasCapability('volume_set') && volumeObject.level) { this.setCapabilityValue('volume_set', volumeObject.level); }
        if (this.hasCapability('volume_mute') && volumeObject.muted) { this.setCapabilityValue('volume_mute', volumeObject.muted); }
    }

    /**
     * Capability method to change the playback state
     * @param {Boolean} value True/false based on player state.
     * @param {Object} opts optional stuff
     */
    async mediaControl(value, opts) {
        if (!this._chromecastDevice) return new Error('Missing Chromecast device');
        
        if (value) return this._chromecastDevice.mediaPlaybackControl('PLAY');
        else return this._chromecastDevice.mediaPlaybackControl('PAUSE');
    }

    /**
     * Function to use the next button to skip 10 seconds
     * 
     * @param {*} value True when next is pressend
     * @param {*} opts 
     */
    async onMediaNext(value, opts) {
        return this._chromecastDevice.mediaPlaybackControl('QUEUE_NEXT');
    }

    /**
     * Function to use the previous button to go back 10 seconds.
     * 
     * @param {*} value True when prev is pressed
     * @param {*} opts 
     */
    async onMediaPrev(value, opts) {
        return this._chromecastDevice.mediaPlaybackControl('QUEUE_PREV');
    }

    /**
     * Capability method to change the volume
     * @param {Double} value New volume level to set
     * @param {Object} opts 
     */
    async onVolumeSet(value, opts) {
        if(!this._chromecastDevice) return;

        return this._chromecastDevice.setVolume(value);
    }

    /**
     * Capability method to mute the volume
     * @param {Boolean} value To mute or not..
     * @param {Object} opts 
     */
    async onVolumeMute(value, opts) {
        if(!this._chromecastDevice) return;
        return this._chromecastDevice.setMute(value);
    }
}
