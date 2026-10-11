"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_datapoint_api = require("./datapoint-api");
var import_web_server = require("./web-server");
const DEFAULT_PORT = 8090;
const DEFAULT_BIND_ADDRESS = "127.0.0.1";
class Nextui extends utils.Adapter {
  webServer;
  datapointApi;
  constructor(options = {}) {
    super({ ...options, name: "nextui" });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    var _a, _b, _c;
    const port = this.getConfiguredPort();
    const bindAddress = ((_a = this.config.bindAddress) == null ? void 0 : _a.trim()) || DEFAULT_BIND_ADDRESS;
    const instance = (_b = this.namespace) != null ? _b : `nextui.${this.instance}`;
    const allowedPatterns = (0, import_datapoint_api.parseAllowedPatterns)(this.config.datapointApiAllowedPatterns);
    const datapointApiEnabled = this.config.datapointApiDevelopmentMode === true && isLoopbackAddress(bindAddress) && allowedPatterns.length > 0;
    if (this.config.datapointApiDevelopmentMode === true && !datapointApiEnabled) {
      this.log.warn(
        "Der Datenpunkt-Entwicklungsmodus bleibt deaktiviert: Loopback-Bindung und mindestens ein erlaubtes ID-Muster sind erforderlich."
      );
    }
    this.datapointApi = datapointApiEnabled ? new import_datapoint_api.DatapointApi(this, allowedPatterns) : void 0;
    this.webServer = new import_web_server.NextuiWebServer({
      port,
      bindAddress,
      instance,
      version: (_c = this.version) != null ? _c : "0.0.1",
      datapointApi: this.datapointApi,
      datapointApiEnabled,
      onError: (error) => this.log.error(`HTTP-Serverfehler: ${error.message}`)
    });
    try {
      await this.webServer.start();
      this.log.info(`HTTP-Server f\xFCr ${instance} l\xE4uft auf ${bindAddress}:${this.webServer.getStatus().port}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(`HTTP-Server konnte nicht gestartet werden: ${message}`);
      this.webServer = void 0;
      this.terminate(message, 1);
    }
  }
  getConfiguredPort() {
    const port = Number(this.config.port);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      return port;
    }
    this.log.warn(`Ung\xFCltiger HTTP-Port "${this.config.port}"; verwende ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  onUnload(callback) {
    const webServer = this.webServer;
    this.webServer = void 0;
    this.datapointApi = void 0;
    if (!webServer) {
      callback();
      return;
    }
    webServer.stop().then(callback).catch((error) => {
      this.log.error(`Fehler beim Beenden des HTTP-Servers: ${error.message}`);
      callback();
    });
  }
}
function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address.toLocaleLowerCase() === "localhost";
}
if (require.main !== module) {
  module.exports = (options) => new Nextui(options);
} else {
  (() => new Nextui())();
}
//# sourceMappingURL=main.js.map
