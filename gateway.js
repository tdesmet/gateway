// Import the Tado client
const Tado = require('node-tado-client');
const cfg = require('home-config').load('.lxgw', {
  "tado": {
    "username": "",
    "password": ""
  }
});
const { Observable, Subject, ReplaySubject, from, of, range } = require('rxjs');
const { map, filter, switchMap } = require('rxjs/operators');
const Loxone = require('./loxone');

const uuidPerZone = {
  "woonkamer": "12ce8849-0036-7239-ffff735f95f7f110",
  "Badkamer": "12ce8e8c-0236-0490-ffff735f95f7f110",
  "Kamer Lexi": "12ce8e8e-01ab-0f4e-ffff735f95f7f110",
  "Bureau": "12ce8e8f-00be-1a0f-ffff735f95f7f110",
};

module.exports = function() {
  const athomeSubject = new Subject();
  const atHomeChangedObservable = athomeSubject.asObservable();
  let atleastOneAtHome = true;
  let homeId;
  let zones;
  const tado = new Tado();
  const loxone = new Loxone(cfg.loxone);

  async function setup() {
    // Login to the Tado Web API
    await tado.login(cfg.tado.username, cfg.tado.password);

    // Get the User's information
    const me = await tado.getMe();

    if (!me.homes || me.homes.length === 0) {
      console.error("No homes found");
      process.exitCode = 1;
      return;
    }

    homeId = me.homes[0].id;
    await loxone.connect();
    zones = (await tado.getZones(homeId)).filter(z => z.type === "HEATING");
    console.log(zones);
    await pollDevices();
  }

  async function pollDevices() {
    const devices = await tado.getMobileDevices(homeId);
    let atHome = false;
    for (const device of devices) {
      if (device.location) {
        atHome = atHome || device.location.atHome;
      }
    }

    if (atleastOneAtHome !== atHome) {
      athomeSubject.next(atHome);
    }
    atleastOneAtHome = atHome;
    for (const zone of zones) {
      const zoneState = await tado.getZoneState(homeId, zone.id);
      if (uuidPerZone[zone.name]) {
        await loxone.sendCommand(uuidPerZone[zone.name], zoneState.sensorDataPoints.insideTemperature.celsius);
      }
    }

    setTimeout(() => {
      pollDevices();
    }, 15000);
  }

  atHomeChangedObservable.subscribe(async (atHome) => {
    if (atHome) {
      console.log('atHome');

      await loxone.sendCommand('12ce6b18-0277-2dcc-ffffec7387844f58', 'pulse');
    } else {
      console.log('notAtHome');

      await loxone.sendCommand('12ce69d5-00d9-2471-ffff255dddd2c9d4', 'pulse');
    }
  });

  setup();
}