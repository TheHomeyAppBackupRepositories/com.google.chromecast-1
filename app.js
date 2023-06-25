'use strict';

const Homey = require('homey');

class Chromecast extends Homey.App {
	
	onInit() {
        this.log('Chromecast is running...');
    }
}

module.exports = Chromecast;