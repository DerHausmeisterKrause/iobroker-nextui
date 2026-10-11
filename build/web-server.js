"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var web_server_exports = {};
__export(web_server_exports, {
  NextuiWebServer: () => NextuiWebServer
});
module.exports = __toCommonJS(web_server_exports);
var import_node_http = require("node:http");
class NextuiWebServer {
  constructor(options) {
    this.options = options;
  }
  server;
  listeningPort;
  start() {
    if (this.server) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const server = (0, import_node_http.createServer)((request, response) => this.handleRequest(request, response));
      let settled = false;
      const onError = (error) => {
        if (settled) return;
        settled = true;
        this.server = void 0;
        reject(this.describeStartError(error));
      };
      server.once("error", onError);
      server.listen(this.options.port, this.options.bindAddress, () => {
        if (settled) return;
        settled = true;
        server.removeListener("error", onError);
        this.server = server;
        const address = server.address();
        this.listeningPort = typeof address === "object" && address ? address.port : this.options.port;
        resolve();
      });
    });
  }
  stop() {
    var _a;
    const server = this.server;
    if (!server) return Promise.resolve();
    this.server = void 0;
    this.listeningPort = void 0;
    (_a = server.closeAllConnections) == null ? void 0 : _a.call(server);
    return new Promise((resolve) => {
      server.close(() => resolve());
    });
  }
  getStatus() {
    var _a;
    return {
      running: this.server !== void 0,
      port: (_a = this.listeningPort) != null ? _a : this.options.port,
      bindAddress: this.options.bindAddress,
      instance: this.options.instance,
      version: this.options.version
    };
  }
  handleRequest(request, response) {
    var _a;
    const requestUrl = new URL((_a = request.url) != null ? _a : "/", "http://localhost");
    if (request.method !== "GET" && request.method !== "HEAD") {
      this.sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    if (requestUrl.pathname === "/api/health") {
      this.sendJson(response, 200, {
        status: "ok",
        server: this.getStatus()
      });
      return;
    }
    if (requestUrl.pathname === "/") {
      this.sendHtml(response, 200, this.renderPage());
      return;
    }
    this.sendJson(response, 404, { error: "Not found" });
  }
  sendJson(response, statusCode, body) {
    var _a;
    const content = JSON.stringify(body);
    response.writeHead(statusCode, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    if (((_a = response.req) == null ? void 0 : _a.method) !== "HEAD") response.end(content);
    else response.end();
  }
  sendHtml(response, statusCode, content) {
    var _a;
    response.writeHead(statusCode, {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    if (((_a = response.req) == null ? void 0 : _a.method) !== "HEAD") response.end(content);
    else response.end();
  }
  renderPage() {
    const instance = escapeHtml(this.options.instance);
    const version = escapeHtml(this.options.version);
    return `<!doctype html>
<html lang="de">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>ioBroker NextUI</title>
	<style>
		:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0b1020; color: #e8ecf7; }
		* { box-sizing: border-box; }
		body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1.25rem; background: radial-gradient(circle at 10% 0%, #26366b, transparent 45%), #0b1020; }
		main { width: min(100%, 42rem); border: 1px solid #394675; border-radius: 1.5rem; padding: clamp(1.5rem, 6vw, 3rem); background: rgba(18, 26, 52, .9); box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, .3); }
		.badge { color: #9fb5ff; font-size: .8rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
		h1 { margin: .6rem 0 .75rem; font-size: clamp(2rem, 8vw, 3.5rem); line-height: 1; }
		.lead { color: #c1c9e2; font-size: 1.05rem; line-height: 1.6; }
		.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .75rem; margin-top: 2rem; }
		.card { padding: 1rem; border-radius: .9rem; background: #202d59; }
		.label { display: block; color: #aab6d8; font-size: .8rem; margin-bottom: .35rem; }
		.value { font-weight: 700; overflow-wrap: anywhere; }
		.status { color: #7df0b4; }
		footer { margin-top: 2rem; color: #8996bc; font-size: .85rem; }
	</style>
</head>
<body>
	<main>
		<div class="badge">ioBroker Adapter</div>
		<h1>ioBroker NextUI</h1>
		<p class="lead">Visualisierung befindet sich in Entwicklung</p>
		<section class="grid" aria-label="Serverinformationen">
			<div class="card"><span class="label">Adapterinstanz</span><span class="value">${instance}</span></div>
			<div class="card"><span class="label">Serverstatus</span><span class="value status">Online</span></div>
			<div class="card"><span class="label">Version</span><span class="value">${version}</span></div>
		</section>
		<footer>Die Grundlage f\xFCr eine responsive ioBroker-Visualisierung.</footer>
	</main>
</body>
</html>`;
  }
  describeStartError(error) {
    if (error.code === "EADDRINUSE") {
      return new Error(`Port ${this.options.port} auf ${this.options.bindAddress} ist bereits belegt.`);
    }
    if (error.code === "EACCES") {
      return new Error(`Keine Berechtigung, den Port ${this.options.port} auf ${this.options.bindAddress} zu \xF6ffnen.`);
    }
    return new Error(`HTTP-Server konnte auf ${this.options.bindAddress}:${this.options.port} nicht gestartet werden: ${error.message}`);
  }
}
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };
    return entities[character];
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NextuiWebServer
});
//# sourceMappingURL=web-server.js.map
