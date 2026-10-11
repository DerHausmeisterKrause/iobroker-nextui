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
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
class InvalidRequestError extends Error {
}
class NextuiWebServer {
  constructor(options) {
    this.options = options;
  }
  server;
  listeningPort;
  lifecycle = Promise.resolve();
  start() {
    return this.enqueue(async () => {
      var _a;
      if ((_a = this.server) == null ? void 0 : _a.listening) {
        return;
      }
      await this.startServer();
    });
  }
  stop() {
    return this.enqueue(async () => {
      var _a;
      const server = this.server;
      if (!server) {
        return;
      }
      this.server = void 0;
      this.listeningPort = void 0;
      (_a = server.closeAllConnections) == null ? void 0 : _a.call(server);
      await new Promise((resolve2) => server.close(() => resolve2()));
    });
  }
  getStatus() {
    var _a, _b;
    return {
      running: ((_a = this.server) == null ? void 0 : _a.listening) === true,
      port: (_b = this.listeningPort) != null ? _b : this.options.port,
      bindAddress: this.options.bindAddress,
      instance: this.options.instance,
      version: this.options.version
    };
  }
  enqueue(operation) {
    const next = this.lifecycle.then(operation, operation);
    this.lifecycle = next.catch(() => void 0);
    return next;
  }
  startServer() {
    return new Promise((resolve2, reject) => {
      const server = (0, import_node_http.createServer)((request, response) => {
        void this.handleRequest(request, response).catch((error) => {
          var _a, _b;
          if (error instanceof InvalidRequestError) {
            if (!response.headersSent) {
              this.sendJson(response, 400, { error: "Bad request" });
            }
            return;
          }
          (_b = (_a = this.options).onError) == null ? void 0 : _b.call(_a, error instanceof Error ? error : new Error(String(error)));
          if (!response.headersSent) {
            this.sendJson(response, 500, { error: "Internal server error" });
          } else if (!response.writableEnded) {
            response.end();
          }
        });
      });
      this.server = server;
      const onRuntimeError = (error) => {
        var _a, _b;
        const describedError = this.describeError(error);
        (_b = (_a = this.options).onError) == null ? void 0 : _b.call(_a, describedError);
        if (!server.listening && this.server === server) {
          this.server = void 0;
          this.listeningPort = void 0;
        }
      };
      const onStartError = (error) => {
        server.removeListener("error", onRuntimeError);
        if (this.server === server) {
          this.server = void 0;
          this.listeningPort = void 0;
        }
        reject(this.describeError(error));
      };
      server.once("error", onStartError);
      server.on("error", onRuntimeError);
      server.listen(this.options.port, this.options.bindAddress, () => {
        server.removeListener("error", onStartError);
        const address = server.address();
        this.listeningPort = typeof address === "object" && address ? address.port : this.options.port;
        resolve2();
      });
    });
  }
  async handleRequest(request, response) {
    var _a;
    const requestUrl = new URL((_a = request.url) != null ? _a : "/", "http://localhost");
    if (request.method !== "GET" && request.method !== "HEAD") {
      this.sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    if (requestUrl.pathname === "/api/health") {
      this.sendJson(response, 200, { status: "ok", server: this.getStatus() });
      return;
    }
    if (requestUrl.pathname === "/api/datapoints") {
      await this.handleDatapointRequest(requestUrl, response);
      return;
    }
    if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) {
      this.sendJson(response, 404, { error: "Not found" });
      return;
    }
    if (await this.serveFrontendFile(requestUrl.pathname, request, response)) {
      return;
    }
    if (requestUrl.pathname === "/") {
      this.sendHtml(response, 200, this.renderPage());
      return;
    }
    this.sendJson(response, 404, { error: "Not found" });
  }
  async handleDatapointRequest(requestUrl, response) {
    var _a, _b;
    if (!this.options.datapointApiEnabled || !this.options.datapointApi) {
      this.sendJson(response, 403, { error: "Datapoint API is disabled" });
      return;
    }
    const offset = parsePaginationParameter(requestUrl.searchParams.get("offset"), "offset");
    const limit = parsePaginationParameter(requestUrl.searchParams.get("limit"), "limit");
    const types = (_a = requestUrl.searchParams.get("types")) == null ? void 0 : _a.split(",").filter(
      (type) => ["boolean", "number", "string", "json"].includes(type)
    );
    this.sendJson(
      response,
      200,
      await this.options.datapointApi.list({
        search: (_b = requestUrl.searchParams.get("search")) != null ? _b : void 0,
        types,
        offset,
        limit
      })
    );
  }
  async serveFrontendFile(pathname, request, response) {
    var _a;
    const frontendDirectory = (0, import_node_path.resolve)((_a = this.options.frontendDirectory) != null ? _a : (0, import_node_path.resolve)(__dirname, "../www/frontend"));
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      throw new InvalidRequestError("The request path is not valid percent-encoding.");
    }
    if (decodedPath.includes("\0")) {
      return false;
    }
    let frontendRoot;
    try {
      frontendRoot = await (0, import_promises.realpath)(frontendDirectory);
    } catch (error) {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
    const relativePath = decodedPath.replace(/^\/+/, "");
    const requestedFile = this.safeFrontendPath(frontendDirectory, relativePath || "index.html");
    const requestedResult = requestedFile ? await this.sendFile(requestedFile, frontendRoot, request, response) : "not-servable";
    if (requestedResult === "served") {
      return true;
    }
    if (requestedResult === "not-servable") {
      return false;
    }
    if (pathname === "/" || (0, import_node_path.extname)(relativePath) === "") {
      const indexFile = this.safeFrontendPath(frontendDirectory, "index.html");
      if (indexFile) {
        return await this.sendFile(indexFile, frontendRoot, request, response) === "served";
      }
    }
    return false;
  }
  safeFrontendPath(frontendDirectory, relativePath) {
    const filePath = (0, import_node_path.resolve)(frontendDirectory, relativePath);
    return filePath.startsWith(`${frontendDirectory}${import_node_path.sep}`) ? filePath : void 0;
  }
  async sendFile(filePath, frontendRoot, request, response) {
    try {
      const resolvedFile = await (0, import_promises.realpath)(filePath);
      if (!resolvedFile.startsWith(`${frontendRoot}${import_node_path.sep}`)) {
        return "not-servable";
      }
      if (!(await (0, import_promises.stat)(resolvedFile)).isFile()) {
        return "not-servable";
      }
      const content = await (0, import_promises.readFile)(resolvedFile);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": getContentType(filePath),
        "X-Content-Type-Options": "nosniff"
      });
      response.end(request.method === "HEAD" ? void 0 : content);
      return "served";
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return "missing";
      }
      if (code === "EACCES" || code === "EPERM") {
        if (!response.headersSent) {
          this.sendJson(response, 403, { error: "Forbidden" });
        }
        return "served";
      }
      throw error;
    }
  }
  sendJson(response, statusCode, body) {
    var _a;
    const content = JSON.stringify(body);
    response.writeHead(statusCode, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(((_a = response.req) == null ? void 0 : _a.method) === "HEAD" ? void 0 : content);
  }
  sendHtml(response, statusCode, content) {
    var _a;
    response.writeHead(statusCode, {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(((_a = response.req) == null ? void 0 : _a.method) === "HEAD" ? void 0 : content);
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
  describeError(error) {
    if (error.code === "EADDRINUSE") {
      return new Error(`Port ${this.options.port} auf ${this.options.bindAddress} ist bereits belegt.`);
    }
    if (error.code === "EACCES") {
      return new Error(
        `Keine Berechtigung, den Port ${this.options.port} auf ${this.options.bindAddress} zu \xF6ffnen.`
      );
    }
    return new Error(
      `HTTP-Server konnte auf ${this.options.bindAddress}:${this.options.port} nicht gestartet werden: ${error.message}`
    );
  }
}
function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  };
  return value.replace(/[&<>'"]/g, (character) => entities[character]);
}
function getContentType(filePath) {
  var _a;
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2"
  };
  return (_a = contentTypes[(0, import_node_path.extname)(filePath)]) != null ? _a : "application/octet-stream";
}
function parsePaginationParameter(value, name) {
  if (value === null || value === "") {
    return void 0;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidRequestError(`Invalid ${name} parameter.`);
  }
  return parsed;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NextuiWebServer
});
//# sourceMappingURL=web-server.js.map
