import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DEFAULT_SETTINGS, normalizeSettings } from "../dist/test/test-api.js";

const background = readFileSync(new URL("../dist/test/background-advanced.js", import.meta.url), "utf8");

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

function harness({ blockDebugger = false, blockMessages = false, blockSessionRules = false } = {}) {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, heliumFlagSync: false });
  const local = { "ghost.settings": settings };
  const session = {};
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
  const attached = new Set();
  const event = name => ({
    addListener(listener) { (events[name] ??= []).push(listener); }
  });
  const storageArea = data => ({
    async get(key) { return { [key]: structuredClone(data[key]) }; },
    async set(value) { Object.assign(data, structuredClone(value)); }
  });
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
    userScripts: {
      async getScripts() { return structuredClone(userScripts); },
      async register(scripts) { userScripts = structuredClone(scripts); },
      async update(scripts) { userScripts = structuredClone(scripts); },
      async unregister() { userScripts = []; }
    },
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
    chrome, URL, setTimeout, clearTimeout, Intl, Date,
    navigator: { userAgent: "Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36" },
    console: { error(...args) { errors.push(args.map(String).join(" ")); } }
  });
  vm.runInContext(background, context, { filename: "background-advanced.js" });
  return {
    local, calls, errors, attached, blocked: blocked.promise, notified: notified.promise,
    initialized: initialized.promise, detached: detached.promise,
    release() { gate.resolve(); },
    failNextGlobalUpdate() { failDynamic = true; },
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
    assert.ok(h.calls.some(call => call.type === "global-headers"), "global headers are applied before success");
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
