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
var datapoint_api_exports = {};
__export(datapoint_api_exports, {
  DatapointApi: () => DatapointApi
});
module.exports = __toCommonJS(datapoint_api_exports);
const STATE_REFRESH_INTERVAL_MS = 5e3;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
class DatapointApi {
  constructor(adapter) {
    this.adapter = adapter;
  }
  objects;
  states = {};
  loadPromise;
  lastStateRefresh = 0;
  async list(query = {}) {
    var _a, _b, _c, _d, _e, _f;
    await this.ensureLoaded();
    await this.refreshStatesIfNeeded();
    const search = (_b = (_a = query.search) == null ? void 0 : _a.trim().toLocaleLowerCase()) != null ? _b : "";
    const types = new Set((_c = query.types) != null ? _c : []);
    const items = Object.entries((_d = this.objects) != null ? _d : {}).map(([id, object]) => this.toListItem(id, object, this.states[id])).filter((item) => item !== void 0).filter(
      (item) => (!search || item.id.toLocaleLowerCase().includes(search) || item.name.toLocaleLowerCase().includes(search)) && (types.size === 0 || types.has(item.type))
    ).sort((left, right) => left.id.localeCompare(right.id));
    const offset = Math.max(0, Math.floor((_e = query.offset) != null ? _e : 0));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor((_f = query.limit) != null ? _f : DEFAULT_LIMIT)));
    return { items: items.slice(offset, offset + limit), total: items.length, offset, limit };
  }
  /**
   * Allows a later subscription layer to keep the cached values current without new object reads.
   *
   * @param id
   * @param state
   */
  updateState(id, state) {
    this.states[id] = state;
  }
  async ensureLoaded() {
    var _a;
    if (this.objects) {
      return;
    }
    (_a = this.loadPromise) != null ? _a : this.loadPromise = this.load();
    await this.loadPromise;
  }
  async load() {
    const [objects, states] = await Promise.all([
      this.adapter.getForeignObjectsAsync("*", "state"),
      this.adapter.getForeignStatesAsync("*")
    ]);
    this.objects = objects;
    this.states = states;
    this.lastStateRefresh = Date.now();
  }
  async refreshStatesIfNeeded() {
    if (Date.now() - this.lastStateRefresh < STATE_REFRESH_INTERVAL_MS) {
      return;
    }
    this.states = await this.adapter.getForeignStatesAsync("*");
    this.lastStateRefresh = Date.now();
  }
  toListItem(id, object, state) {
    var _a;
    const value = (_a = state == null ? void 0 : state.val) != null ? _a : null;
    const type = getValueType(object.common.type, value);
    if (!type) {
      return void 0;
    }
    return {
      id,
      name: getName(object.common.name, id),
      type,
      value,
      unit: object.common.unit,
      role: object.common.role,
      readable: object.common.read !== false,
      writable: object.common.write === true,
      ts: state == null ? void 0 : state.ts,
      ack: state == null ? void 0 : state.ack
    };
  }
}
function getName(name, fallback) {
  var _a, _b, _c;
  if (typeof name === "string") {
    return name;
  }
  return (_c = (_b = (_a = name == null ? void 0 : name.en) != null ? _a : name == null ? void 0 : name.de) != null ? _b : Object.values(name != null ? name : {})[0]) != null ? _c : fallback;
}
function getValueType(objectType, value) {
  if (objectType === "boolean") {
    return "boolean";
  }
  if (objectType === "number") {
    return "number";
  }
  if (objectType !== "string") {
    return void 0;
  }
  return typeof value === "string" && isJsonValue(value) ? "json" : "string";
}
function isJsonValue(value) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DatapointApi
});
//# sourceMappingURL=datapoint-api.js.map
