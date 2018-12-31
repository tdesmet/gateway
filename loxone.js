const LxCommunicator = require('lxcommunicator');
const uuidv4 = require('uuid/v4');

module.exports = class Loxone {
  constructor(config) {
    this.connected = false;
    this.uuid = uuidv4();
    this.deviceInfo = require('os').hostname();
    this.config = config;
    this.cache = [];
    this.delegate = {
      socketOnDataProgress: (socket, progress) => {
        console.log(progress);
      },
      socketOnTokenConfirmed: (socket, response) => {
        console.log(response);
      },
      socketOnTokenReceived: (socket, result) => {
        console.log(result);
      },
      socketOnConnectionClosed: (socket, code) => {
        console.log(code);
        this.connected = false;
        this.connect();
      },
      socketOnEventReceived: (socket, events, type) => {
        if (type === 2) {
          for (const event of events) {
            this.cache[event.uuid] = event;
          }
        }
      }
    }
  }
  async connect() {
    const WebSocketConfig = LxCommunicator.WebSocketConfig;

    // Instantiate a config object to pass it to the LxCommunicator.WebSocket later
    const config = new WebSocketConfig(WebSocketConfig.protocol.WS, this.uuid, this.deviceInfo, WebSocketConfig.permission.APP, false);
    // OPTIONAL: assign the delegateObj to be able to react on delegate calls
    config.delegate = this.delegate;

    // Instantiate the LxCommunicator.WebSocket, it is our actual WebSocket
    this.socket = new LxCommunicator.WebSocket(config);

    try {
      // Open a Websocket connection to a miniserver by just providing the host, username and password!
      await this.socket.open(this.config.address, this.config.username, this.config.password);
    } catch(error) {
      setTimeout(() => {
        this.connect();
      }, 10000);
    }
    //await this.socket.send("jdev/sps/enablebinstatusupdate");
    const file = await this.socket.send("data/LoxAPP3.json");
    console.log(file);
    this.connected = true;
    this.keepAlive();
  }

  keepAlive() {
    if (!this.connected) return;
    setTimeout(async ()=> {
      if (!this.connected) return;
      await this.socket.send("keepalive");
      this.keepAlive();
    }, 1000 * 60);
  }

  async sendCommand(uuid, command) {
    await this.socket.send(`jdev/sps/io/${uuid}/${command}`);
  }
}