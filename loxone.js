const LxCommunicator = require('lxcommunicator');
const WebSocketConfig = LxCommunicator.WebSocketConfig;
const uuidv4 = require('uuid/v4');
const serializeError = require('serialize-error');

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
        this.connect();
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
    this.log.info("Trying to connect");
    if (this.connected) {
      this.log.info("We are connected, ignoring");
      return;
    }

    try {
      // Open a Websocket connection to a miniserver by just providing the host, username and password!
      await this.socket.open(this.config.address, this.config.username, this.config.password);
    } catch(error) {
      this.log.warn("Failed to connect, retrying in 10 seconds");
      setTimeout(() => {
        this.connect();
      }, 10000);
      return;
    }
    //await this.socket.send("jdev/sps/enablebinstatusupdate");
    try {
      this.log.info("Requesting structure file");
      const file = await this.socket.send("data/LoxAPP3.json");
    } catch (error) {
      this.log.error("Failed to get structure file ", serializeError(error));
      this.close();
      setTimeout(() => {
        this.connect();
      }, 5000);
      return;
    }
    this.connected = true;
  }

  async sendCommand(uuid, command) {
    if (!this.connected) {
      this.log.warn("Not connected, Ignoring command", serializeError({uuid: uuid, command: command}));
      return;
    }
    try {
      await this.socket.send(`jdev/sps/io/${uuid}/${command}`);
    } catch(err) {
      this.log.error("Failed to send command ", serializeError({err: err, uuid: uuid, command: command}));
    }
  }
}