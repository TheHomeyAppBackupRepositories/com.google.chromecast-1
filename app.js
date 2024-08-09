'use strict';

const Homey = require('homey');
const SoundBoard = require('./lib/SoundBoard');

class Chromecast extends Homey.App {
	
	onInit() {
        this.log('Chromecast is running...');

        const { homey } = this;
        this.soundBoard = new SoundBoard({ homey });
    }
}

module.exports = Chromecast;