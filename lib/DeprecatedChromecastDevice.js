'use strict';

const Homey = require('homey');

module.exports = class DeprecatedChromecastDevice extends Homey.Device {
        onInit() {
        super.onInit();

        this.setUnavailable(this.homey.__('deprecated'));
        }
}