'use strict';

const fetch = require('node-fetch');
const Homey = require('homey');

module.exports = class GenericChromecastDriver extends Homey.Driver {
    onInit() {
        super.onInit();

        // Register flows

        // Triggers

        this.castStartedFlowTrigger = this.homey.flow.getDeviceTriggerCard('cast_started');
        this.castStartedFlowTrigger.registerRunListener(async (args, state) => {
            Object.values(args.app_id).forEach(app => {
                return !!app === state.app_name;
            });
        });
        
        this.castStartedFlowTrigger.getArgument('app_id')
            .registerAutocompleteListener(this.onFlowActionAppStartedAutoComplete.bind(this));
        this.castStoppedFlowTrigger = this.homey.flow.getDeviceTriggerCard('cast_stopped');

        // Actions
        // URL cast
        const castURLFromFlow = this.homey.flow.getActionCard('castUrl');
        castURLFromFlow.registerRunListener((args, state) => { return args.device.castURL(args.url) });

        // YouTube cast
        let castYoutTubeFromFlow = this.homey.flow.getActionCard('castYouTube');
        castYoutTubeFromFlow
            .registerRunListener((args, state) => {
                return args.device.castYouTube(args.youtube_id);
            });
        
        // Video cast
        let castVideoFromFlow = this.homey.flow.getActionCard('castVideo');
        castVideoFromFlow
            .registerRunListener((args, state) => { return args.device.castMedia(args.url, args.repeat) });

        // Audio cast
        let castAudioFromFlow = this.homey.flow.getActionCard('castAudio');
        castAudioFromFlow
            .registerRunListener((args, state) => { return args.device.castMedia(args.url, args.repeat) });
        
        // TuneIn cast
        let castRadioFromFlow = this.homey.flow.getActionCard('castRadio');
        castRadioFromFlow
            .registerRunListener((args, state) => { return args.device.castTuneInRadio(args.station_id) });
        castRadioFromFlow.getArgument('station_id')
            .registerAutocompleteListener(this.onFlowActionCastTuneInRadioAutocomplete.bind(this));

        // Internet Radio cast
        let castWebRadioFromFlow = this.homey.flow.getActionCard('castWebRadio');
        castWebRadioFromFlow
            .registerRunListener((args, state) => { return args.device.castWebRadio(args.station_id) });
        castWebRadioFromFlow.getArgument('station_id')
            .registerAutocompleteListener(this.onFlowActionCastWebRadioAutocomplete.bind(this));

        // Picture cast
        let castPictureFromFlow = this.homey.flow.getActionCard('castPicture');
        castPictureFromFlow
            .registerRunListener(async (args, state) => {
                if (!(args.droptoken instanceof Homey.Image)) throw new Error('Could not cast invalid image.');
                return args.device.castImage(args.droptoken.localUrl);
            });

        // Soundboard cast
        let castSoundboardFromFlow = this.homey.flow.getActionCard('castSoundboard');
        castSoundboardFromFlow
            .registerRunListener(async ({ device, sound }) => {
                return device.castSoundboardSound(sound);
            })
            .getArgument('sound')
            .registerAutocompleteListener(async query => {
                return this.homey.app.soundBoard.getSoundboardSounds().then(sounds => {
                    return sounds.filter(sound => {
                        return sound.name.toLowerCase().includes(query.toLowerCase());
                    });
                });
            });
        
        // Stop the current action.
        let stopCastFromFlow = this.homey.flow.getActionCard('stop');
        stopCastFromFlow
            .registerRunListener((args, state) => { return args.device.stopCast(); });
     }
    
    onPair(socket) {
        const onListDevices = async (data) => {
            const discoveryStrategy = this.getDiscoveryStrategy();
            const foundChromecastDevices = discoveryStrategy.getDiscoveryResults();

            const devices = Object.values(foundChromecastDevices).map(device => {
                return {
                    name: device.txt.fn, // use the friendly name as the name, e.g. 'Woonkamer'
                    data: {
                        id: device.txt.id, //uuid from chromecast
                        model: device.txt.md, // not directly neccessary but good to store in the device data.
                    },
                    icon: this.getIcon(device.txt),
                }
            });

            return devices;
        }

        socket.setHandler('list_devices', onListDevices);
    }

    getIcon(properties) {
        switch(properties.md) {
            case 'Chromecast':
                if (properties.ca == '4101') return '/icons/chromecast_old.svg';
                return '/icons/chromecast.svg';

            case 'Google Home':
                return '/icons/home.svg'

            case 'Google Home Mini':
                return '/icons/nest_mini.svg';

            case 'Google Nest Hub':
                return '/icons/nest_display.svg';

            case 'Google Nest Mini':
                return '/icons/nest_mini.svg';

            case 'LenovoCD-24501F':
                return '/icons/24501F.svg';

            case 'LenovoCD-24502F':
                return '/icons/24502F.svg';

            case 'Nest Audio':
                return '/icons/nest_audio.svg';

            case 'Pixel Tablet':
                return '/icons/nest_display.svg';

            default:
                return '/icons/cast.svg';
        }
    }

    triggerCastStarted(device, tokens, state) {
        this.castStartedFlowTrigger.trigger(device, tokens, state)
            .catch(this.error);
    }

    triggerCastStopped(device, tokens, state) {
        this.castStoppedFlowTrigger.trigger(device, tokens, state)
            .catch(this.error);
    }

    async onFlowActionAppStartedAutoComplete(query, args) {
        const apps = await this.homey.settings.get('applications');

        const result = [];
        
        Object.values(apps).forEach(app => {
            result.push({
                name: app,
            });
        });

        return result;
    }


    async onFlowActionCastWebRadioAutocomplete(query, args) {
        if (query.length < 1) return [];
        const res = await fetch(`https://de1.api.radio-browser.info/json/stations/byname/${query}?hidebroken=true&limit=50`)
        if( !res.ok ) throw new Error('unknown_error');
        const body = await res.json();
        
        return body.map(item => {
            return {
                id: item.stationuuid,
                name: item.name,
                description: item.homepage,
            }
        });
    }

    async onFlowActionCastTuneInRadioAutocomplete(query, args) {
        // if( query.length < 3 ) return [];

        const res = await fetch('https://api.tunein.com/profiles?fullTextSearch=true&query=' + encodeURIComponent(query));
        if( !res.ok ) throw new Error('unknown_error');
        const body = await res.json();

        const result = [];

        body.Items.forEach(container => {
            if( container.ContainerType !== 'Stations' ) return;
            container.Children.forEach(station => {
                
                result.push({
                    id: station.GuideId,
                    name: station.Title,
                    description: station.Subtitle,
                    image: station.Image,
                });
            });
        });

        return result;
    }
};
