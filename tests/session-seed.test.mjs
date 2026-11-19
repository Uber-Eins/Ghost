import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { DEFAULT_SETTINGS, normalizeSettings, resolveProfile, stableSeed } from "../dist/test/test-api.js";

const settings = normalizeSettings({ ...DEFAULT_SETTINGS, siteProfiles: { "*": "tokyo-ja-jp" } });
const url = "https://example.com/path";
const resolve = (salt, pageUrl = url, partitionUrl = pageUrl) =>
  resolveProfile(pageUrl, settings, 0, partitionUrl, salt);

test("session seed is stable for the same salt, top-level site and profile", () => {
  assert.equal(resolve("session-one").seed, resolve("session-one").seed);
  assert.equal(resolve("session-one").seed, resolve("session-one", "https://other.test/frame", url).seed);
});

test("session seed rotates across sites, salts and profile ids", () => {
  const seeds = [url, "https://other.test/"].flatMap(site =>
    ["session-one", "session-two"].map(salt => resolve(salt, site).seed));
  assert.equal(new Set(seeds).size, 4);
  const otherProfile = normalizeSettings({ ...settings, siteProfiles: { "*": "new-york-en-us" } });
  assert.notEqual(resolve("session-one").seed, resolveProfile(url, otherProfile, 0, url, "session-one").seed);
});

test("salt never changes persistent profile selection or settings", () => {
  const before = structuredClone(settings);
  assert.equal(resolve("session-one").profile.id, resolve("session-two").profile.id);
  assert.equal(resolve("session-one").profile.id, resolve().profile.id);
  assert.deepEqual(settings, before);
});

test("missing session salt preserves the deterministic legacy seed", () => {
  const legacy = resolve();
  assert.equal(legacy.seed, stableSeed(legacy.siteKey, legacy.profile.id));
  assert.equal(legacy.seed, resolve("").seed);
  assert.equal(legacy.seed, resolve().seed);
});

const pageMain = readFileSync(new URL("../dist/advanced/page-main.js", import.meta.url), "utf8");

function pageHarness(bootstrap) {
  const context = vm.createContext({ crypto: webcrypto, URL, queueMicrotask, __GHOST_BOOTSTRAP_SETTINGS__: bootstrap });
  vm.runInContext(`
    globalThis.window = globalThis;
    globalThis.top = globalThis;
    globalThis.parent = globalThis;
    globalThis.location = { href: "https://example.com/path", reload() { reloads++; } };
    globalThis.reloads = 0;
    globalThis.document = { referrer: "" };
    globalThis.listeners = {};
    globalThis.addEventListener = (name, listener) => { listeners[name] = listener; };
    globalThis.setTimeout = () => 0;
    globalThis.history = { pushState() {}, replaceState() {} };
    globalThis.Navigator = class Navigator {};
    globalThis.navigator = new Navigator();
    Object.assign(navigator, { language: "en-US", languages: ["en-US"], userAgent: "Chrome/152.0.0.0", platform: "Linux", vendor: "Google Inc." });
    globalThis.CanvasRenderingContext2D = class CanvasRenderingContext2D {
      constructor() { this.font = "10px sans-serif"; }
      measureText() { return { width: 100 }; }
    };
    globalThis.MessageChannel = class MessageChannel {
      constructor() {
        this.port1 = { start() {}, close() {}, postMessage(message) { globalThis.request = message; } };
        this.port2 = {};
        globalThis.activePort = this.port1;
      }
    };
    globalThis.postMessage = message => { globalThis.connection = message; };
  `, context);
  vm.runInContext(pageMain, context);
  const deliver = (type, payload) => context.activePort.onmessage({ data: {
    channel: context.connection.channel, nonce: context.connection.nonce,
    type, payload, requestId: context.request?.requestId
  } });
  deliver("connected");
  return {
    width: () => vm.runInContext('new CanvasRenderingContext2D().measureText("session seed").width', context),
    profile: profile => deliver("profile", profile),
    refresh: () => deliver("refresh"),
    restored: () => context.listeners.pageshow({ persisted: true }),
    get reloads() { return context.reloads; },
    get bootstrapDeleted() { return !("__GHOST_BOOTSTRAP_SETTINGS__" in context); }
  };
}

test("bootstrap documents keep their original noise through restart-race replies and history refreshes", () => {
  const page = pageHarness({ settings, sessionSalt: "previous-session" });
  const initialWidth = page.width();
  assert.equal(page.bootstrapDeleted, true);
  page.profile(resolve("new-session"));
  assert.equal(page.width(), initialWidth);
  page.refresh();
  page.profile(resolve("new-session"));
  page.restored();
  page.profile(resolve("new-session"));
  assert.equal(page.width(), initialWidth);
  assert.equal(page.reloads, 0);
});

test("older bootstrap payloads without salt keep deterministic noise without reloading", () => {
  const page = pageHarness({ settings });
  const initialWidth = page.width();
  page.refresh();
  page.profile(resolve("new-session"));
  assert.equal(page.width(), initialWidth);
  assert.equal(page.reloads, 0);
});

test("fallback documents without bootstrap keep adopting asynchronous session seeds", () => {
  const page = pageHarness(undefined);
  page.profile(resolve("new-session"));
  const saltedPage = pageHarness({ settings, sessionSalt: "new-session" });
  assert.equal(page.width(), saltedPage.width());
  assert.equal(page.reloads, 0);
});
