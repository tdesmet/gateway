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
const SimpleLogger = require('simple-node-logger');
const serializeError = require('serialize-error');
const manager = new SimpleLogger();
manager.createConsoleAppender();
const log = manager.createLogger('Gateway', 'info');
process.on('error', (msg) => {
    log.error('Error event caught: ', serializeError(msg));
});
console.error = function(...args) {
  log.error(...args);
};
console.warn = function(...args) {
  log.warn(...args);
};
console.info = function(...args) {
  log.info(...args);
};
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
  const loxone = new Loxone(cfg.loxone, manager.createLogger('Loxone', 'info'));

  function setup() {
    setupTado();
    loxone.connect();
  }

  async function setupTado() {
    try {
      log.info("Trying to login on tado");
      // Login to the Tado Web API
      await tado.login(cfg.tado.username, cfg.tado.password);
    } catch(err) {
      log.error("Failed to login to tado ", serializeError(err));
      setTimeout(setupTado, 10000);
      return;
    }
    // Get the User's information
    try {
      log.info("Trying to get me from tado");
      const me = await tado.getMe();

      if (!me.homes || me.homes.length === 0) {
        log.error("No homes found");
        setTimeout(setupTado, 10000);
        return;
      }

      homeId = me.homes[0].id;
    } catch(err) {
      log.error("Failed to get me from tado ", serializeError(err));
      setTimeout(setupTado, 10000);
      return;
    }
    try {
      log.info("Trying to get the zones from tado");
      zones = (await tado.getZones(homeId)).filter(z => z.type === "HEATING");
    } catch (err) {
      log.error("Failed to get the zones from tado ", serializeError(err));
      setTimeout(setupTado, 10000);
      return;
    }
    pollDevices();
    pollZones();
  }

  async function pollDevices() {
    try {
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
    } catch (err) {
      log.error("Failed to get the mobile devices from tado", serializeError(err));
    }
    setTimeout(() => {
      pollDevices();
    }, 15000);
  }

  async function pollZones() {
    try {
      for (const zone of zones) {
        const zoneState = await tado.getZoneState(homeId, zone.id);
        if (uuidPerZone[zone.name]) {
          await loxone.sendCommand(uuidPerZone[zone.name], zoneState.sensorDataPoints.insideTemperature.celsius);
        }
      }
    } catch (err) {
      log.error("Failed to get the zone status from tado", serializeError(err));
    }
    setTimeout(() => {
      pollZones();
    }, 60000);
  }

  atHomeChangedObservable.subscribe(async (atHome) => {
    if (atHome) {
      log.info("Someone arrived home");
      await loxone.sendCommand('12ce6b18-0277-2dcc-ffffec7387844f58', 'pulse');
    } else {
      log.info("Everyone has left home");
      await loxone.sendCommand('12ce69d5-00d9-2471-ffff255dddd2c9d4', 'pulse');
    }
  });

  setup();
}