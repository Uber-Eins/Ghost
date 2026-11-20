import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { DEFAULT_SETTINGS, effectiveGeolocation, normalizeSettings, PRESET_PROFILES, resolveProfile } from "../dist/test/test-api.js";

const background = readFileSync(new URL("../dist/advanced/background.js", import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function promptly(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("request waited for unrelated tab work")), 500);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function harness({ blockDebugger = false, blockMessages = false, blockSessionRules = false, userScriptsAuthorized = true, fetch, session = {} } = {}) {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, heliumFlagSync: false });
  const local = { "ghost.settings": settings };
  const events = {};
  const errors = [];
  const calls = [];
  const blocked = deferred();
  const notified = deferred();
  const gate = deferred();
  const initialized = deferred();
  const detached = deferred();
  let userScripts = [];
  let contentScripts = [];
  let dynamicRules = [];
  let sessionRules = [];
  let failDynamic = false;
  let nextDynamicGate;
  let rejectUserScriptRead = false;
  let failUserScriptWrite = false;
  const attached = new Set();
  const event = name => ({
    addListener(listener) { (events[name] ??= []).push(listener); }
  });
  const storageArea = data => ({
    async get(key) { return { [key]: structuredClone(data[key]) }; },
    async set(value) {
      if (data === session) calls.push({ type: "session-storage", value: structuredClone(value) });
      Object.assign(data, structuredClone(value));
    }
  });
  const userScriptsApi = {
    async getScripts() {
      if (rejectUserScriptRead) throw new Error("User Scripts access is not allowed");
      return structuredClone(userScripts);
    },
    async register(scripts) { await this.update(scripts); },
    async update(scripts) {
      if (failUserScriptWrite) {
        failUserScriptWrite = false;
        throw new Error("forced bootstrap write failure");
      }
      userScripts = structuredClone(scripts);
    },
    async unregister() { calls.push({ type: "unregister-user-script" }); userScripts = []; }
  };
  const chrome = {
    storage: { local: storageArea(local), session: storageArea(session) },
    runtime: {
      onInstalled: event("installed"),
      onStartup: event("startup"),
      onMessage: event("message")
    },
    alarms: {
      onAlarm: event("alarm"),
      async clear() {},
      async create() {}
    },
    tabs: {
      onRemoved: event("removed"),
      onUpdated: event("updated"),
      async query() { return [{ id: 7, url: "https://example.com/" }]; },
      async sendMessage(tabId, message) {
        calls.push({ type: "notify", tabId, message });
        notified.resolve();
        if (blockMessages) {
          blocked.resolve();
          await gate.promise;
        }
      }
    },
    get userScripts() { return userScriptsAuthorized ? userScriptsApi : undefined; },
    scripting: {
      async getRegisteredContentScripts() { return structuredClone(contentScripts); },
      async registerContentScripts(scripts) { contentScripts = structuredClone(scripts); },
      async updateContentScripts(scripts) { contentScripts = structuredClone(scripts); },
      async unregisterContentScripts() { contentScripts = []; }
    },
    action: { async setIcon() { initialized.resolve(); } },
    extension: { async isAllowedFileSchemeAccess() { return true; } },
    debugger: {
      onDetach: event("detach"),
      async attach({ tabId }) { attached.add(tabId); },
      async detach(target) {
        attached.delete(target.tabId);
        for (const listener of events.detach ?? []) listener(target);
        detached.resolve();
      },
      async sendCommand({ tabId }, method, params) {
        calls.push({ type: "debugger", tabId, method, params });
        if (blockDebugger && method === "Emulation.setGeolocationOverride") {
          blocked.resolve();
          await gate.promise;
        }
        return {};
      }
    },
    declarativeNetRequest: {
      ResourceType: Object.fromEntries([
        "MAIN_FRAME", "SUB_FRAME", "STYLESHEET", "SCRIPT", "IMAGE", "FONT", "OBJECT",
        "XMLHTTPREQUEST", "PING", "CSP_REPORT", "MEDIA", "WEBSOCKET", "OTHER"
      ].map(key => [key, key.toLowerCase()])),
      RuleActionType: { MODIFY_HEADERS: "modifyHeaders", ALLOW: "allow", ALLOW_ALL_REQUESTS: "allowAllRequests" },
      HeaderOperation: { SET: "set", REMOVE: "remove" },
      async isRegexSupported() { return { isSupported: true }; },
      async getSessionRules() { return structuredClone(sessionRules); },
      async updateSessionRules({ removeRuleIds = [], addRules = [] }) {
        if (blockSessionRules) {
          blocked.resolve();
          await gate.promise;
        }
        sessionRules = sessionRules.filter(rule => !removeRuleIds.includes(rule.id)).concat(structuredClone(addRules));
      },
      async getDynamicRules() { return structuredClone(dynamicRules); },
      async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
        const pause = nextDynamicGate;
        nextDynamicGate = undefined;
        if (pause) await pause();
        if (failDynamic) {
          failDynamic = false;
          throw new Error("forced global header failure");
        }
        dynamicRules = dynamicRules.filter(rule => !removeRuleIds.includes(rule.id)).concat(structuredClone(addRules));
        calls.push({ type: "global-headers" });
      }
    }
  };
  const context = vm.createContext({
    chrome, URL, setTimeout, clearTimeout, Intl, Date, crypto: webcrypto, fetch, AbortController, structuredClone,
    navigator: { userAgent: "Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36" },
    console: { error(...args) { errors.push(args.map(String).join(" ")); } }
  });
  vm.runInContext(background, context, { filename: "background.js" });
  return {
    local, session, calls, errors, attached, blocked: blocked.promise, notified: notified.promise,
    initialized: initialized.promise, detached: detached.promise,
    release() { gate.resolve(); },
    failNextGlobalUpdate() { failDynamic = true; },
    gateNextGlobalUpdate(pause) { nextDynamicGate = pause; },
    allowUserScripts() { userScriptsAuthorized = true; },
    revokeUserScriptsAccess() { rejectUserScriptRead = true; },
    failNextUserScriptWrite() { failUserScriptWrite = true; },
    get dynamicRules() { return structuredClone(dynamicRules); },
    get userScripts() { return structuredClone(userScripts); },
    get contentScripts() { return structuredClone(contentScripts); },
    fire(name) { for (const listener of events[name] ?? []) listener(); },
    request(message, sender = {}) {
      return new Promise(resolve => {
        events.message[0](structuredClone(message), sender, resolve);
      });
    },
    get bootstrap() {
      return JSON.parse(userScripts[0].js[0].code.match(/const p=(.*?);try/)[1]);
    }
  };
}

test("settings save and a subsequent save do not wait for a slow tab debugger", async () => {
  const h = harness({ blockDebugger: true });
  try {
    const save = h.request({ type: "options.saveState", settings: h.local["ghost.settings"] });
    await promptly(h.blocked);
    assert.equal((await promptly(save)).ok, true);
    const next = await promptly(h.request({ type: "setGlobalEnabled", enabled: false }));
    assert.equal(next.ok, true);
    assert.equal(h.local["ghost.settings"].enabled, false);
    assert.equal(h.bootstrap.settings.enabled, false, "the early document payload is updated before success");
    assert.deepEqual(h.dynamicRules, []);
    await promptly(h.notified);
  } finally {
    h.release();
  }
});

test("startup does not block popup reads behind a slow debugger or tab message", async () => {
  for (const options of [{ blockDebugger: true }, { blockMessages: true }]) {
    const h = harness(options);
    try {
      h.fire("startup");
      await promptly(h.blocked);
      const response = await promptly(h.request({ type: "getPopupState", url: "https://example.com/" }));
      assert.equal(response.ok, true);
      assert.equal(response.value.siteKey, "example.com");
      assert.ok(response.value.profiles.length > 0);
      assert.equal((await promptly(h.request({ type: "options.getState" }))).ok, true);
    } finally {
      h.release();
    }
  }
});

test("a nonresponding content message does not block subsequent settings commits", async () => {
  const h = harness({ blockMessages: true });
  try {
    const first = h.request({ type: "setGlobalEnabled", enabled: false });
    await promptly(h.blocked);
    assert.equal((await promptly(first)).ok, true);
    const second = await promptly(h.request({ type: "setGlobalEnabled", enabled: true }));
    assert.equal(second.ok, true);
    assert.equal(h.bootstrap.settings.enabled, true);
  } finally {
    h.release();
  }
});

test("failure to apply global protection rejects saving and restores settings and bootstrap", async () => {
  const h = harness();
  await promptly(h.initialized);
  h.failNextGlobalUpdate();
  const response = await promptly(h.request({ type: "setGlobalEnabled", enabled: false }));
  assert.equal(response.ok, false);
  assert.equal(h.local["ghost.settings"].enabled, true);
  assert.equal(h.bootstrap.settings.enabled, true);
});

test("cold worker wake reconciles global protection without requiring a startup event", async () => {
  const h = harness();
  await promptly(h.initialized);
  assert.equal(h.bootstrap.settings.enabled, true);
  assert.ok(h.calls.some(call => call.type === "global-headers"));
  assert.equal((await promptly(h.request({ type: "getPopupState", url: "https://example.com/" }))).ok, true);
});

test("page profile replies and page notifications do not wait behind CDP", async () => {
  const h = harness({ blockDebugger: true });
  try {
    await promptly(h.blocked);
    await promptly(h.notified);
    const response = await promptly(h.request(
      { type: "resolveProfile", url: "https://example.com/" },
      { frameId: 0, url: "https://example.com/", tab: { id: 7, url: "https://example.com/" } }
    ));
    assert.equal(response.ok, true);
    assert.equal(response.value.enabled, true);
    assert.equal(response.value.advanced.applied, false, "a pending CDP operation is not reported as applied");
  } finally {
    h.release();
  }
});

test("queued obsolete debugger settings are skipped and the latest disabled state wins", async () => {
  const h = harness({ blockDebugger: true });
  try {
    await promptly(h.blocked);
    assert.equal((await promptly(h.request({
      type: "setSiteProfile", siteKey: "example.com", profileId: "new-york-en-us"
    }))).ok, true);
    const latest = { ...h.local["ghost.settings"], advancedEnabled: false };
    assert.equal((await promptly(h.request({ type: "options.saveState", settings: latest }))).ok, true);
    h.release();
    await promptly(h.detached);
    assert.equal(h.attached.size, 0);
    assert.equal(h.calls.some(call => call.method === "Emulation.setTimezoneOverride"
      && call.params?.timezoneId === "America/New_York"), false);
  } finally {
    h.release();
  }
});

test("a pending per-tab header update does not block global protection commits", async () => {
  const h = harness({ blockSessionRules: true });
  try {
    assert.equal((await promptly(h.request({ type: "setGlobalEnabled", enabled: false }))).ok, true);
    await promptly(h.blocked);
    const latest = await promptly(h.request({ type: "setGlobalEnabled", enabled: true }));
    assert.equal(latest.ok, true);
    assert.equal(h.bootstrap.settings.enabled, true);
    assert.equal((await promptly(h.request({ type: "getPopupState", url: "https://example.com/" }))).ok, true);
  } finally {
    h.release();
  }
});


test("a profile reply uses the latest settings if a save completes during its tab header update", async () => {
  const h = harness({ blockSessionRules: true });
  await promptly(h.initialized);
  // IPv6 uses tab-scoped rules, unlike the ordinary tab from startup fan-out.
  const url = "http://[::1]:8765/";
  const pending = h.request({ type: "resolveProfile", url }, { url, frameId: 0, tab: { id: 8, url } });
  try {
    await promptly(h.blocked);
    const save = await promptly(h.request({ type: "setGlobalEnabled", enabled: false }));
    assert.equal(save.ok, true, save.error);
  } finally {
    h.release();
  }
  const reply = await promptly(pending);
  assert.equal(reply.ok, true, reply.error);
  assert.equal(reply.value.enabled, false);
  assert.equal(reply.value.reason, "global-disabled");
});

test("session noise salt is created once and reused across worker restarts and settings saves", async () => {
  const first = harness();
  await promptly(first.initialized);
  const salt = first.bootstrap.sessionSalt;
  assert.match(salt, /^[a-f0-9]{32}$/);
  assert.deepEqual(Object.values(first.session), [salt]);
  const response = await promptly(first.request(
    { type: "resolveProfile", url: "https://example.com/" },
    { frameId: 0, url: "https://example.com/", tab: { id: 7, url: "https://example.com/" } }
  ));
  assert.equal(response.ok, true);
  const synchronous = resolveProfile("https://example.com/", first.bootstrap.settings, Date.now(), "https://example.com/", salt);
  assert.equal(response.value.seed, synchronous.seed);
  assert.equal(JSON.stringify(response).includes(salt), false);
  await promptly(first.request({ type: "setGlobalEnabled", enabled: false }));
  assert.equal(first.bootstrap.sessionSalt, salt);
  assert.equal(first.calls.filter(call => call.type === "session-storage" && "ghost.sessionNoiseSalt" in call.value).length, 1);
  assert.equal(JSON.stringify(first.local).includes(salt), false);

  const restarted = harness({ session: first.session });
  await promptly(restarted.initialized);
  assert.equal(restarted.bootstrap.sessionSalt, salt);
  assert.equal(restarted.calls.filter(call => call.type === "session-storage" && "ghost.sessionNoiseSalt" in call.value).length, 0);

  const nextSession = harness();
  await promptly(nextSession.initialized);
  assert.notEqual(nextSession.bootstrap.sessionSalt, salt);
  assert.deepEqual(first.errors, []);
  assert.deepEqual(restarted.errors, []);
  assert.deepEqual(nextSession.errors, []);
});

test("CDP and the synchronous bootstrap compute the same session-jittered coordinates", async () => {
  const h = harness({ blockDebugger: true });
  try {
    await promptly(h.blocked);
    const { settings, sessionSalt } = h.bootstrap;
    const { profile, seed } = resolveProfile("https://example.com/", settings, Date.now(), undefined, sessionSalt);
    const params = structuredClone(h.calls.find(call => call.method === "Emulation.setGeolocationOverride").params);
    assert.deepEqual(params, effectiveGeolocation(profile, seed));
    assert.notEqual(params.latitude, profile.latitude);
    assert.notEqual(params.longitude, profile.longitude);
  } finally {
    h.release();
  }
});

test("background recheck sees newly granted User Scripts access and uses queued, current settings", async () => {
  const h = harness({ userScriptsAuthorized: false });
  await promptly(h.initialized);
  assert.deepEqual(h.userScripts, []);
  assert.deepEqual(h.contentScripts, []);
  assert.equal((await h.request({ type: "getPopupState", url: "https://example.com/" })).value.earlyBootstrapAvailable, false);
  assert.equal((await h.request({ type: "recheckContentBootstrap" })).value, false);
  h.allowUserScripts();
  const save = h.request({ type: "setGlobalEnabled", enabled: false });
  const recheck = h.request({ type: "recheckContentBootstrap", settings: { enabled: true } });
  assert.equal((await promptly(save)).ok, true);
  assert.equal((await promptly(recheck)).value, true);
  assert.equal(h.bootstrap.settings.enabled, false);
  assert.match(h.bootstrap.sessionSalt, /^[a-f0-9]{32}$/);
  assert.equal(h.userScripts[0].world, "MAIN");
  assert.equal(h.userScripts[0].runAt, "document_start");
  assert.equal(h.userScripts[0].js[1].file, "page-main.js");
});

test("an asynchronous User Scripts authorization rejection leaves saves working but unprotected", async () => {
  const h = harness();
  const url = "https://example.com/";
  await promptly(h.initialized);
  assert.equal((await promptly(h.request({ type: "getPopupState", url }))).value.earlyBootstrapAvailable, true);
  h.revokeUserScriptsAccess();

  const save = await promptly(h.request({ type: "setSiteProfile", siteKey: "example.com", profileId: "tokyo-ja-jp" }));
  assert.equal(save.ok, true, save.error);
  assert.equal(h.local["ghost.settings"].siteProfiles["example.com"], "tokyo-ja-jp");
  assert.deepEqual(h.contentScripts, []);
  const popup = await promptly(h.request({ type: "getPopupState", url }));
  assert.equal(popup.ok, true, popup.error);
  assert.equal(popup.value.earlyBootstrapAvailable, false);
});

test("authorized bootstrap write failure rejects save and preserves the previous script", async () => {
  for (const initialAccess of [true, false]) {
    const h = harness({ userScriptsAuthorized: initialAccess });
    await promptly(h.initialized);
    const previous = h.userScripts;
    h.allowUserScripts();
    h.failNextUserScriptWrite();
    const result = await promptly(h.request({ type: "setGlobalEnabled", enabled: false }));
    assert.equal(result.ok, false);
    assert.equal(h.local["ghost.settings"].enabled, true);
    assert.equal(h.bootstrap.settings.enabled, true);
    assert.equal(h.calls.some(call => call.type === "unregister-user-script"), false);
    if (initialAccess) assert.deepEqual(h.userScripts, previous);
  }
});

const ipLocation = {
  ip: "203.0.113.231", timezone: "Asia/Taipei", latitude: 25.033, longitude: 121.5654,
  country_code: "TW", country: "Taiwan", region: "Taipei", city: "Taipei"
};
const locationResponse = () => ({ ok: true, json: async () => ipLocation });

test("enabling automatic location fetches and applies the sanitized cache, which a stale options save cannot overwrite", async () => {
  const requests = [];
  const h = harness({ fetch: async url => { requests.push(url); return locationResponse(); } });
  await promptly(h.initialized);
  h.fire("startup");
  const disabled = await promptly(h.request({ type: "options.refreshAutomaticLocation" }));
  assert.equal(disabled.ok, true);
  assert.deepEqual(requests, []);
  const staleOptions = { ...h.local["ghost.settings"], automaticLocationEnabled: true };
  assert.equal((await promptly(h.request({ type: "options.saveState", settings: staleOptions }))).ok, true);
  const refreshed = await promptly(h.request({ type: "options.refreshAutomaticLocation" }));
  assert.equal(refreshed.ok, true, refreshed.error);
  assert.equal(requests[0], "https://api.ip.sb/geoip");
  const saved = await promptly(h.request({
    type: "options.saveState", settings: { ...staleOptions, automaticLocationEnabled: false, advancedEnabled: false }
  }));
  assert.equal(saved.value.automaticLocation.timezoneId, "Asia/Taipei", "options cannot replace background-owned data");
  const cache = structuredClone(refreshed.value.automaticLocation);
  assert.deepEqual(h.local["ghost.settings"].automaticLocation, cache);
  assert.equal(JSON.stringify(h.local).includes(ipLocation.ip), false);

  assert.equal((await promptly(h.request({ type: "options.saveState", settings: {
    ...staleOptions, advancedEnabled: false
  } }))).ok, true);
  const reply = await promptly(h.request({ type: "resolveProfile", url: "https://example.com/" }, { url: "https://example.com/" }));
  const { timezoneId, latitude, longitude } = reply.value.profile;
  assert.deepEqual({ timezoneId, latitude, longitude }, { timezoneId: "Asia/Taipei", latitude: 25.033, longitude: 121.5654 });
  assert.equal(h.bootstrap.settings.automaticLocation.timezoneId, "Asia/Taipei");
});

test("a location result queues behind a failing save and merges into the rolled-back settings", async () => {
  const fetching = deferred(), response = deferred(), applying = deferred(), release = deferred();
  const h = harness({ fetch: async () => { fetching.resolve(); return response.promise; } });
  await promptly(h.initialized);
  assert.equal((await promptly(h.request({ type: "options.saveState", settings: {
    ...h.local["ghost.settings"], automaticLocationEnabled: true
  } }))).ok, true);
  const location = h.request({ type: "options.refreshAutomaticLocation" });
  await promptly(fetching.promise);
  h.failNextGlobalUpdate();
  h.gateNextGlobalUpdate(async () => { applying.resolve(); await release.promise; });
  const save = h.request({ type: "setGlobalEnabled", enabled: false });
  try {
    await promptly(applying.promise);
    response.resolve(locationResponse());
    await new Promise(setImmediate);
    assert.equal(h.local["ghost.settings"].automaticLocation, null);
  } finally {
    release.resolve();
  }
  assert.equal((await promptly(save)).ok, false);
  const refreshed = await promptly(location);
  assert.equal(refreshed.ok, true, refreshed.error);
  assert.equal(h.local["ghost.settings"].enabled, true);
  assert.equal(h.bootstrap.settings.enabled, true);
  assert.equal(h.bootstrap.settings.automaticLocation.timezoneId, "Asia/Taipei");
});

test("a settings reply waits for its own DNR update and queued edits start from the committed state", async () => {
  const h = harness();
  await promptly(h.initialized);
  assert.ok(h.dynamicRules.some(rule => rule.action.type === "modifyHeaders"));
  const updating = deferred(), release = deferred();
  h.gateNextGlobalUpdate(async () => { updating.resolve(); await release.promise; });
  let replied = false;
  const disable = h.request({ type: "setGlobalEnabled", enabled: false }).then(result => { replied = true; return result; });
  try {
    await promptly(updating.promise);
    await new Promise(setImmediate);
    assert.equal(replied, false);
    assert.ok(h.dynamicRules.some(rule => rule.action.type === "modifyHeaders"));
  } finally {
    release.resolve();
  }
  assert.equal((await promptly(disable)).ok, true);
  assert.deepEqual(h.dynamicRules, []);
  const [a, b] = await promptly(Promise.all([
    h.request({ type: "setSiteProfile", siteKey: "a.example", profileId: "los-angeles-en-us" }),
    h.request({ type: "setSiteProfile", siteKey: "b.example", profileId: "tokyo-ja-jp" })
  ]));
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(h.local["ghost.settings"].siteProfiles["a.example"], "los-angeles-en-us");
  assert.equal(h.local["ghost.settings"].siteProfiles["b.example"], "tokyo-ja-jp");
});

test("the registered bootstrap loads the shipped page bundle and applies its keyboard layout", async () => {
  const h = harness();
  const profile = { ...PRESET_PROFILES[0], id: "test-keyboard", keyboardLayout: "de" };
  const saved = await promptly(h.request({ type: "options.saveState", settings: {
    ...h.local["ghost.settings"], customProfiles: [profile], siteProfiles: { "*": profile.id }
  } }));
  assert.equal(saved.ok, true);
  const broadcasts = [];
  const context = vm.createContext({ crypto: webcrypto, URL, postMessage: data => broadcasts.push(structuredClone(data)) });
  vm.runInContext(`
    var window = globalThis, top = window, parent = window;
    var document = { referrer: '' }, location = { href: 'https://example.com/' };
    var history = {}, addEventListener = () => {}, setTimeout = () => 0;
    var MessageChannel = class { constructor() { this.port1 = { start() {} }; this.port2 = {}; } };
    var backing = new WeakMap();
    var KeyboardLayoutMap = class KeyboardLayoutMap {
      constructor(entries) { backing.set(this, new Map(entries)); }
      keys() { return backing.get(this).keys(); }
      get(key) { return backing.get(this).get(key); }
    };
    var nativeLayout = new KeyboardLayoutMap([['KeyY', 'host-y']]);
    var Keyboard = class Keyboard {
      getLayoutMap() {
        if (this !== keyboard) throw new TypeError('Illegal invocation');
        return Promise.resolve(nativeLayout);
      }
    };
    var keyboard = new Keyboard(), Navigator = class Navigator { get keyboard() { return keyboard; } };
    var navigator = new Navigator();
  `, context);
  for (const script of h.userScripts[0].js) {
    const source = script.code ?? readFileSync(new URL(`../dist/advanced/${script.file}`, import.meta.url), "utf8");
    vm.runInContext(source, context);
  }
  const layout = await vm.runInContext("navigator.keyboard.getLayoutMap()", context);
  assert.ok(layout instanceof vm.runInContext("KeyboardLayoutMap", context));
  assert.equal(layout.get("KeyY"), "z");
  assert.equal(broadcasts.length, 1);
  assert.match(broadcasts[0].nonce, /^[a-f0-9]{32}$/);
  assert.deepEqual(broadcasts[0], { channel: "ghost-profile-v1", type: "connect", nonce: broadcasts[0].nonce });
  assert.equal(vm.runInContext("'__GHOST_BOOTSTRAP_SETTINGS__' in window", context), false);
});
