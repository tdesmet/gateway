const LxCommunicator = require('lxcommunicator');
const WebSocketConfig = LxCommunicator.WebSocketConfig;
const uuidv4 = require('uuid/v4');
const serializeError = require('serialize-error');
const utils = require('./utils');
const to = require('await-to-js').default;

module.exports = class Loxone {
  constructor(config, log) {
    this.connected = false;
    this.uuid = uuidv4();
    this.deviceInfo = require('os').hostname();
    this.config = config;
    this.log = log;
    this.cache = [];
    // Instantiate a config object to pass it to the LxCommunicator.WebSocket later
    const webSocketConfig = new WebSocketConfig(WebSocketConfig.protocol.WS, this.uuid, this.deviceInfo, WebSocketConfig.permission.APP, false);
    // OPTIONAL: assign the delegateObj to be able to react on delegate calls
    webSocketConfig.delegate = {
      socketOnDataProgress: (socket, progress) => {
        this.log.info("data progress ", progress);
      },
      socketOnTokenConfirmed: (socket, response) => {
        this.log.info("token confirmed ", serializeError(response));
      },
      socketOnTokenReceived: (socket, result) => {
        this.log.info("token received ", serializeError(result));
      },
      socketOnConnectionClosed: (socket, code) => {
        this.log.info("Socket closed ", code);
        this.connected = false;
        this.log.info("Trying to reconnect");
        this.connect().then(() => log.info("connected to loxone")).catch(err => log.error("connection to loxone failed"));
      },
      socketOnEventReceived: (socket, events, type) => {
        if (type === 2) {
          for (const event of events) {
            this.cache[event.uuid] = event;
          }
        }
      }
    };
    // Instantiate the LxCommunicator.WebSocket, it is our actual WebSocket
    this.socket = new LxCommunicator.WebSocket(webSocketConfig);
  }

  close() {
    try {
      this.socket.close();
    } catch (err) {

    }
    this.connected = false;
  }

  async connect() {
    let err, file;
    this.log.info("Trying to connect");
    if (this.connected) {
      this.log.info("We are connected, ignoring");
      return;
    }
    while (!this.connected) {
      // Open a Websocket connection to a miniserver by just providing the host, username and password!
      [err] = await to(this.socket.open(this.config.address, this.config.username, this.config.password));
      if (err) {
        this.log.warn("Failed to connect, retrying in 10 seconds");
        await utils.delay(10000);
        continue;
      }
      //await this.socket.send("jdev/sps/enablebinstatusupdate");
      this.log.info("Requesting structure file");
      [err, file] = await to(this.socket.send("data/LoxAPP3.json"));
      if (err) {
        this.log.error("Failed to get structure file ", serializeError(err));
        this.close();
        await utils.delay(5000);
        continue;
      }
      this.connected = true;
    }
  }

  sendCommand(uuid, command) {
    if (!this.connected) {
      this.log.warn("Not connected, Ignoring command", serializeError({ uuid: uuid, command: command }));
      return;
    }
    this.socket.send(`jdev/sps/io/${uuid}/${command}`).catch(err => {
      this.log.error("Failed to send command ", serializeError({ err: err, uuid: uuid, command: command }));
    });
  }
}