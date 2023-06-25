'use strict'

const ChromecastDevice = require('../lib/ChromecastDevice');
const AthomWebCast = require('../lib/Application/WebCaster');

const castClient = new ChromecastDevice({
    id: '3c292a39bc7f6253a993371ab55edc61', // POS chromecast
    md: 'Chromecast',
    fn: 'Athom POS',
    address: '192.168.87.34'
});

startTest();

async function startTest() {
    const status = await castClient.getStatus();
    console.log('DEVICE STATUS', status);

    const caster = await castClient.startApp(AthomWebCast);
    //caster.loadURL('http://athom.com');
    caster.loadURL('https://app.homey.ink/?theme=web&token=eyJfX2F0aG9tX2FwaV90eXBlIjoiQXRob21DbG91ZEFQSS5Ub2tlbiIsInRva2VuX3R5cGUiOiJiZWFyZXIiLCJhY2Nlc3NfdG9rZW4iOiJmOTYyNzIwNjU0NTdjYTU5NThlM2M1YzY2YjQwZmNkNmY1MWIwMGNkIiwiZXhwaXJlc19hdCI6IjIwMTktMDQtMjlUMTI6NTk6NDcuNjI2WiIsInJlZnJlc2hfdG9rZW4iOiI3ZjdlNjA2NGEzMGNhOTRlNGM4Y2Y4NGFiODBjMjNmNWIwNjRlNmNjIn0%3D');
}