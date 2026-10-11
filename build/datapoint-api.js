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
  DatapointApi: () => DatapointApi,
  parseAllowedPatterns: () => parseAllowedPatterns
});
module.exports = __toCommonJS(datapoint_api_exports);
const STATE_CACHE_TTL_MS = 5e3;
const STATE_CACHE_MAX_ENTRIES = 500;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
class DatapointApi {
  constructor(adapter, allowedPatterns) {
    this.adapter = adapter;
    this.allowedPatterns = allowedPatterns;
  }
  objects;
  objectLoadPromise;
  states = /* @__PURE__ */ new Map();
  stateRequests = /* @__PURE__ */ new Map();
  async list(query = {}) {
    var _a, _b;
    await this.ensureObjectIndex();
    const offset = Math.max(0, Math.floor((_a = query.offset) != null ? _a : 0));
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor((_b = query.limit) != null ? _b : DEFAULT_LIMIT)));
    const candidates = this.filterObjects(query);
    const page = candidates.slice(offset, offset + limit);
    await this.ensureStates(page.map(([id]) => id));
    return {
      items: page.map(([id, object]) => {
        var _a2;
        return this.toListItem(id, object, (_a2 = this.states.get(id)) == null ? void 0 : _a2.state);
      }).filter((item) => item !== void 0),
      total: candidates.length,
      offset,
      limit
    };
  }
  /** Accepts a future state subscription update without triggering a read. */
  updateState(id, state) {
    if (this.isAllowed(id)) {
      this.setCachedState(id, state);
    }
  }
  /** Invalidates the object index after a future object subscription notification. */
  invalidateObjects() {
    this.objects = void 0;
    this.states.clear();
  }
  async ensureObjectIndex() {
    var _a, _b;
    if (this.objects || this.allowedPatterns.length === 0) {
      (_a = this.objects) != null ? _a : this.objects = {};
      return;
    }
    (_b = this.objectLoadPromise) != null ? _b : this.objectLoadPromise = this.loadObjectIndex().finally(() => {
      this.objectLoadPromise = void 0;
    });
    await this.objectLoadPromise;
  }
  async loadObjectIndex() {
    const responses = await Promise.all(
      this.allowedPatterns.map((pattern) => this.adapter.getForeignObjectsAsync(pattern, "state"))
    );
    this.objects = Object.assign({}, ...responses);
  }
  filterObjects(query) {
    var _a, _b, _c, _d;
    const search = (_b = (_a = query.search) == null ? void 0 : _a.trim().toLocaleLowerCase()) != null ? _b : "";
    const types = new Set((_c = query.types) != null ? _c : []);
    return Object.entries((_d = this.objects) != null ? _d : {}).filter(([id, object]) => this.isAllowed(id) && object.common.read !== false).filter(([id, object]) => {
      const declaredType = getDeclaredType(object.common.type);
      return declaredType !== void 0 && (!search || id.toLocaleLowerCase().includes(search) || getName(object.common.name, id).toLocaleLowerCase().includes(search)) && (types.size === 0 || (declaredType === "string" ? types.has("string") || types.has("json") : types.has(declaredType)));
    }).sort(([left], [right]) => left.localeCompare(right));
  }
  async ensureStates(ids) {
    const now = Date.now();
    const missingIds = ids.filter((id) => {
      const cached = this.states.get(id);
      return !cached || now - cached.fetchedAt >= STATE_CACHE_TTL_MS;
    });
    if (missingIds.length === 0) {
      return;
    }
    const requestKey = [...missingIds].sort().join("\0");
    let request = this.stateRequests.get(requestKey);
    if (!request) {
      request = this.loadStates(missingIds).finally(() => this.stateRequests.delete(requestKey));
      this.stateRequests.set(requestKey, request);
    }
    await request;
  }
  async loadStates(ids) {
    var _a;
    const states = await this.adapter.getForeignStatesAsync(ids);
    for (const id of ids) {
      this.setCachedState(id, (_a = states[id]) != null ? _a : null);
    }
  }
  setCachedState(id, state) {
    this.states.delete(id);
    this.states.set(id, { state, fetchedAt: Date.now() });
    while (this.states.size > STATE_CACHE_MAX_ENTRIES) {
      const oldest = this.states.keys().next().value;
      if (!oldest) {
        break;
      }
      this.states.delete(oldest);
    }
  }
  isAllowed(id) {
    return this.allowedPatterns.some((pattern) => matchesPattern(id, pattern));
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
      readable: true,
      writable: object.common.write === true,
      ts: state == null ? void 0 : state.ts,
      ack: state == null ? void 0 : state.ack
    };
  }
}
function parseAllowedPatterns(value) {
  return [
    ...new Set(
      (value != null ? value : "").split(/[\n,]/).map((pattern) => pattern.trim()).filter(Boolean)
    )
  ];
}
function matchesPattern(id, pattern) {
  const expression = new RegExp(`^${pattern.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return expression.test(id);
}
function getName(name, fallback) {
  var _a, _b, _c;
  if (typeof name === "string") {
    return name;
  }
  return (_c = (_b = (_a = name == null ? void 0 : name.en) != null ? _a : name == null ? void 0 : name.de) != null ? _b : Object.values(name != null ? name : {})[0]) != null ? _c : fallback;
}
function getDeclaredType(objectType) {
  return objectType === "boolean" || objectType === "number" || objectType === "string" ? objectType : void 0;
}
function getValueType(objectType, value) {
  const declaredType = getDeclaredType(objectType);
  if (declaredType !== "string") {
    return declaredType;
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
  DatapointApi,
  parseAllowedPatterns
});
//# sourceMappingURL=datapoint-api.js.map
