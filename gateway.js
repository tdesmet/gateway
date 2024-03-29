// Import the Tado client
const Tado = require('./tado-client');
const utils = require('./utils');
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
const to = require('await-to-js').default;
const opts = {
  timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS'
};
const manager = new SimpleLogger();
manager.createConsoleAppender(opts);
const log = manager.createLogger('Gateway', 'info');

console.error = function (...args) {
  log.info(...args);
};
console.warn = function (...args) {
  log.warn(...args);
};
console.info = function (...args) {
  log.info(...args);
};
const uuidPerZone = {
  "woonkamer": "12ce8849-0036-7239-ffff735f95f7f110"
};
process.on('unhandledRejection', (error, promise) => {
  throw error;
});

module.exports = function () {
  const athomeSubject = new Subject();
  const atHomeChangedObservable = athomeSubject.asObservable();
  let atleastOneAtHome = true;
  let homeId;
  let zones;
  const tado = new Tado(manager.createLogger('Tado', 'info'));
  const loxone = new Loxone(cfg.loxone, manager.createLogger('Loxone', 'info'));
  let runCounter = 0;
  let isConnected = false;


  async function tadoTask() {
    let err, loginres, me, ret;
      try {
        log.info("TadoTask");
        if (!isConnected) {
          log.info("Trying to login on tado");
          // Login to the Tado Web API
          [err, loginres] = await utils.callFuncWithTimeout(() => tado.login(cfg.tado.username, cfg.tado.password));
          if (err) {
            log.info("Failed to login to tado ");
            return;
          }
          // Get the User's information

          log.info("Trying to get me from tado");
          [err, me] = await utils.callFuncWithTimeout(() => tado.getMe());
          if (err) {
            log.info("Failed to get me from tado ");
            return;
          }

          if (!me.homes || me.homes.length === 0) {
            log.info("No homes found");
            return;
          }

          homeId = me.homes[0].id;
          isConnected = true;
        }

        if (runCounter % 4 == 0) {
          log.info("Trying to get the zones from tado");
          [err, zones] = await utils.callFuncWithTimeout(() => tado.getZones(homeId));

          if (err) {
            log.info("Failed to get zones from tado ");
            [err, me] = await utils.callFuncWithTimeout(() => tado.getMe());
            if (err) {
              log.info("Failed to get me from tado ");
              isConnected = false;
              return;
            }
          }

          zones = zones.filter(z => z.type === "HEATING");
          if (!await pollZones()) {
            [err, me] = await utils.callFuncWithTimeout(() => tado.getMe());
            if (err) {
              log.info("Failed to get me from tado ");
              isConnected = false;
              return;
            }
          }
          runCounter = 0;
        }
        if (!await pollDevices()) {
          [err, me] = await utils.callFuncWithTimeout(() => tado.getMe());
          if (err) {
            log.info("Failed to get me from tado ");
            isConnected = false;
            return;
          }
        }
        runCounter++;
        return;
      } catch (err) {
        log.info("Tado task error", serializeError(err));
        isConnected = false;
      }
  }


  async function pollDevices() {
    log.info('pollDevices');
    let err, devices;
    try {
      [err, devices] = await utils.callFuncWithTimeout(() => tado.getMobileDevices(homeId));
      if (err) {
        log.info("Failed to get the mobile devices from tado");
        return false;
      }
      log.info('got devices');
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
      return true;
    } catch (err) {
      log.info("Failed to get the mobile devices from tado");
      return false;
    }
  }

  async function pollZones() {
    log.info('pollZones');
    let err, zoneState;
    try {
      for (const zone of zones) {
        [err, zoneState] = await utils.callFuncWithTimeout(() => tado.getZoneState(homeId, zone.id));
        if (err) {
          log.info("Failed to get the zone status from tado");
          return false;
        }
        log.info('got zone state');
        if (uuidPerZone[zone.name]) {
          log.info('send command to loxone for zone ' + zone.name);
          loxone.sendCommand(uuidPerZone[zone.name], zoneState.sensorDataPoints.insideTemperature.celsius);
          log.info('done sending command to loxone for zone ' + zone.name);
        }
      }
      return true;
    } catch (err) {
      log.info("Failed to get the zone status from tado");
      return false;
    }
  }

  atHomeChangedObservable.subscribe(async (atHome) => {
    if (atHome) {
      log.info("Someone arrived home");
      loxone.sendCommand('12ce6b18-0277-2dcc-ffffec7387844f58', 'pulse');
    } else {
      log.info("Everyone has left home");
      loxone.sendCommand('12ce69d5-00d9-2471-ffff255dddd2c9d4', 'pulse');
    }
  });

  function runTadoTask(timeInMs) {
    setTimeout(async () => {
      try {
        await utils.callFuncWithTimeout(() => tadoTask(), 60000);
      } catch(e) {
        log.info("tadoTask failed", serializeError(e));
      }
      runTadoTask(15000);
    }, timeInMs);
  }

  try {
    loxone.connect().then(() => log.info("loxone connect completed"), err => log.info("loxone connect failed", serializeError(err)));
    runTadoTask(5000);
  } catch (ex) {
    log.info("setup failed", serializeError(ex));
  }
}
