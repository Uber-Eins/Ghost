import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { DEFAULT_SETTINGS, normalizeSettings } from "../dist/test/test-api.js";

const pageMain = readFileSync(new URL("../dist/lite/page-main.js", import.meta.url), "utf8");
const pageRelated = readFileSync(new URL("../dist/lite/page-related.js", import.meta.url), "utf8");
// Deliberately never install Ghost here: this is lies()'s fresh iframe realm.
const foreignToString = vm.runInNewContext("Function.prototype.toString");
const settings = normalizeSettings({ ...DEFAULT_SETTINGS, siteProfiles: { "*": "tokyo-ja-jp" } });

// Proxied, branded mocks model native WebIDL surfaces. Ordinary JS mocks would
// themselves fail the detector before Ghost even ran. Real Date/Intl are V8's.
const setup = `
  var window = globalThis, self = globalThis, top = globalThis, parent = globalThis;
  var location = { href: 'https://example.com/path', reload() {} };
  var listeners = {}, document = { referrer: '', fonts: null };
  var addEventListener = (name, listener) => { listeners[name] = listener; };
  var setTimeout = () => 0, setInterval = () => 0, clearInterval = () => {};
  var postMessage = () => {};
  var MessageChannel = class { constructor() { this.port1 = { start() {}, postMessage() {} }; this.port2 = {}; } };
  function nativeMethod(owner, name, implementation) {
    Object.defineProperty(owner, name, { configurable: true, writable: true,
      value: new Proxy(implementation, {}) });
  }
  function nativeGetter(owner, name, brand, read) {
    const getter = Object.getOwnPropertyDescriptor({ get [name]() {
      if (!brand.has(this)) throw new TypeError('Illegal invocation');
      return read(this);
    } }, name).get;
    Object.defineProperty(owner, name, { configurable: true, enumerable: true, get: new Proxy(getter, {}) });
  }
  var navBrand = new WeakSet(), screenBrand = new WeakSet(), gpuBrand = new WeakSet();
  var Navigator = class Navigator { constructor() { navBrand.add(this); } };
  var navigator = new Navigator();
  var NavigatorUAData = class NavigatorUAData {};
  nativeMethod(NavigatorUAData.prototype, 'getHighEntropyValues', { async getHighEntropyValues(hints) { return {}; } }.getHighEntropyValues);
  nativeMethod(NavigatorUAData.prototype, 'toJSON', { toJSON() { return {}; } }.toJSON);
  var uaData = new NavigatorUAData();
  var Geolocation = class Geolocation {};
  for (const [name, fn] of Object.entries({ getCurrentPosition(success, error, options) {}, watchPosition(success, error, options) { return 1; }, clearWatch(id) {} })) nativeMethod(Geolocation.prototype, name, fn);
  var GeolocationCoordinates = class GeolocationCoordinates {};
  nativeMethod(GeolocationCoordinates.prototype, 'toJSON', { toJSON() {
    return { accuracy: this.accuracy, latitude: this.latitude, longitude: this.longitude, altitude: this.altitude,
      altitudeAccuracy: this.altitudeAccuracy, heading: this.heading, speed: this.speed };
  } }.toJSON);
  var GeolocationPosition = class GeolocationPosition {};
  nativeMethod(GeolocationPosition.prototype, 'toJSON', { toJSON() { return { timestamp: this.timestamp, coords: this.coords.toJSON() }; } }.toJSON);
  var geo = new Geolocation();
  for (const [key, value] of Object.entries({
    language: 'en-US', languages: ['en-US'], deviceMemory: 8,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/152.0.0.0 Safari/537.36',
    appVersion: '5.0', platform: 'Win32', vendor: 'Google Inc.', userAgentData: uaData, geolocation: geo
  })) nativeGetter(Navigator.prototype, key, navBrand, () => value);
  var Screen = class Screen { constructor() { screenBrand.add(this); } }, screen = new Screen();
  for (const [key, value] of Object.entries({ width: 3840, height: 2160, availWidth: 3840, availHeight: 2120, availLeft: 0, availTop: 0, isExtended: true, colorDepth: 24, pixelDepth: 24 })) nativeGetter(Screen.prototype, key, screenBrand, () => value);
  var outerWidth = 1000, outerHeight = 600;
  var mediaBrand = new WeakSet();
  var MediaQueryList = class MediaQueryList { constructor(media) { mediaBrand.add(this); this.query = media; } };
  nativeGetter(MediaQueryList.prototype, 'media', mediaBrand, receiver => receiver.query);
  var matchMedia = new Proxy({ matchMedia(query) { return new MediaQueryList(query); } }.matchMedia, {});
  var canvasBrand = new WeakSet();
  var CanvasRenderingContext2D = class CanvasRenderingContext2D { constructor() { canvasBrand.add(this); this.font = '10px sans-serif'; } };
  nativeMethod(CanvasRenderingContext2D.prototype, 'measureText', { measureText(text) {
    if (!canvasBrand.has(this)) throw new TypeError('Illegal invocation'); return { width: 100 };
  } }.measureText);
  var FontFaceSet = class FontFaceSet { [Symbol.iterator]() { return [][Symbol.iterator](); } };
  nativeMethod(FontFaceSet.prototype, 'check', { check(font, text) { return true; } }.check);
  nativeMethod(FontFaceSet.prototype, 'load', { load(font, text) { return Promise.resolve([]); } }.load);
  document.fonts = new FontFaceSet();
  var WebGLRenderingContext = class WebGLRenderingContext {};
  nativeMethod(WebGLRenderingContext.prototype, 'getParameter', { getParameter(parameter) { return 'native'; } }.getParameter);
  var WebGL2RenderingContext = class WebGL2RenderingContext {};
  nativeMethod(WebGL2RenderingContext.prototype, 'getParameter', { getParameter(parameter) { return 'native'; } }.getParameter);
  var GPUAdapterInfo = class GPUAdapterInfo { constructor() { gpuBrand.add(this); } };
  for (const key of ['vendor', 'architecture', 'device', 'description']) nativeGetter(GPUAdapterInfo.prototype, key, gpuBrand, () => 'native');
  var iframeData = new WeakMap();
  var HTMLIFrameElement = class HTMLIFrameElement { constructor(child) { iframeData.set(this, child); } };
  nativeGetter(HTMLIFrameElement.prototype, 'contentWindow', iframeData, receiver => iframeData.get(receiver));
  nativeGetter(HTMLIFrameElement.prototype, 'contentDocument', iframeData, receiver => ({ defaultView: iframeData.get(receiver) }));
  var history = {};
  nativeMethod(history, 'pushState', { pushState(data, unused, url) {} }.pushState);
  nativeMethod(history, 'replaceState', { replaceState(data, unused, url) {} }.replaceState);
  var blobByUrl = new Map(), lastWorkerUrl, nextUrl = 0;
  var Blob = class Blob { constructor(parts = [], options = {}) { this.parts = parts; this.type = options.type || ''; } };
  var Worker = class Worker { constructor(url) { lastWorkerUrl = url; } };
  var URL = class URL extends HostURL {};
  nativeMethod(URL, 'createObjectURL', { createObjectURL(blob) { const url = 'blob:' + ++nextUrl; blobByUrl.set(url, blob); return url; } }.createObjectURL);
  nativeMethod(URL, 'revokeObjectURL', { revokeObjectURL(url) { blobByUrl.delete(url); } }.revokeObjectURL);
  var originals = [];
  function snapshot(owner, label) {
    for (const key of Reflect.ownKeys(owner)) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      for (const slot of ['value', 'get', 'set']) {
        const fn = descriptor[slot];
        if (typeof fn === 'function') originals.push({ owner, key, slot, fn, label: label + '.' + String(key), getter: slot === 'get' });
      }
    }
  }
  for (const name of ['Function', 'Date', 'Navigator', 'Screen', 'CanvasRenderingContext2D', 'FontFaceSet', 'NavigatorUAData', 'Geolocation', 'WebGLRenderingContext', 'WebGL2RenderingContext', 'GPUAdapterInfo', 'MediaQueryList', 'HTMLIFrameElement']) {
    snapshot(globalThis[name].prototype, name + '.prototype');
  }
  snapshot(globalThis, 'globalThis');
  snapshot(history, 'history'); snapshot(URL, 'URL');
  var nativeIntl = {};
  for (const name of ['DateTimeFormat', 'NumberFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'ListFormat', 'DisplayNames', 'Segmenter']) {
    if (!Intl[name]) continue;
    nativeIntl[name] = Intl[name];
    snapshot(Intl[name].prototype, 'Intl.' + name + '.prototype');
    snapshot(Intl[name], 'Intl.' + name);
  }
  snapshot(Intl, 'Intl');
  var NativeDate = Date, nativeDateNow = Date.now, nativeDateUTC = Date.UTC, nativeDateParse = Date.parse;
  var navigatorKeys = Reflect.ownKeys(navigator), screenKeys = Reflect.ownKeys(screen);
`;

function realm() {
  const context = vm.createContext({ crypto: webcrypto, queueMicrotask, HostURL: URL });
  const run = source => vm.runInContext(source, context);
  run(setup);
  return { context, run };
}
function page() {
  const h = realm();
  h.context.__GHOST_BOOTSTRAP_SETTINGS__ = { settings, build: "lite", sessionSalt: "native-wrappers" };
  h.run(pageMain);
  return h;
}

function detect(h, minimum) {
  const entries = h.run(`originals.map(entry => ({ ...entry, current: Object.getOwnPropertyDescriptor(entry.owner, entry.key)?.[entry.slot] })).filter(entry => entry.current && entry.current !== entry.fn)`);
  assert.ok(entries.length >= minimum, `only ${entries.length} replacements tested`);
  const checked = [];
  for (const { fn: native, current, owner, getter, label } of entries) {
    assert.match(foreignToString.call(current), /\{\s*\[native code\]\s*\}\s*$/, label);
    // lies()'s own-prototype rule applies to methods/getters, not constructors
    // (Date and Intl constructors natively have an own prototype).
    for (const key of ["prototype", "arguments", "caller"]) {
      assert.equal(Object.hasOwn(current, key), Object.hasOwn(native, key), `${label}: own ${key}`);
    }
    assert.equal(current.name, native.name, `${label}: name`);
    assert.equal(current.length, native.length, `${label}: length`);
    assert.equal(current.toString(), foreignToString.call(native), `${label}: page masking`);
    if (getter) assert.throws(() => current.call(Object.create(owner)), { name: "TypeError" }, `${label}: receiver`);
    checked.push(label);
  }
  assert.equal(h.run("JSON.stringify(Reflect.ownKeys(navigator)) === JSON.stringify(navigatorKeys)"), true);
  assert.equal(h.run("JSON.stringify(Reflect.ownKeys(screen)) === JSON.stringify(screenKeys)"), true);
  return checked;
}

function checkConstructors(h) {
  assert.equal(h.run(`
    Date.length === 7 && Date.name === 'Date' &&
    Date.prototype === NativeDate.prototype && Date.prototype.constructor === Date &&
    Object.getPrototypeOf(new Date()) === Date.prototype && new Date() instanceof Date &&
    Date.now === nativeDateNow && Date.UTC === nativeDateUTC && Date.parse === nativeDateParse &&
    typeof Date() === 'string' && typeof Date(0) === 'string'
  `), true);
  assert.equal(h.run(`
    class SubDate extends Date {}
    const sub = new SubDate(2025, 0, 2, 3, 4, 5, 6);
    const reflected = Reflect.construct(Date, [1234], SubDate);
    sub instanceof Date && sub instanceof SubDate && sub.constructor === SubDate &&
    Object.getPrototypeOf(sub) === SubDate.prototype &&
    Object.getPrototypeOf(reflected) === SubDate.prototype && reflected.getTime() === 1234 &&
    sub.getFullYear() === 2025 && sub.getMonth() === 0 && sub.getDate() === 2 && sub.getHours() === 3 &&
    new Date(1234).getTime() === 1234 && Number.isNaN(new Date(NaN).getTime()) &&
    new Date(NaN).toString() === 'Invalid Date'
  `), true);
  for (const name of h.run("Object.keys(nativeIntl)")) {
    const options = name === "DisplayNames" ? ", {type: 'language'}" : "";
    assert.equal(h.run(`
      (() => {
        const Wrapped = Intl.${name}, Native = nativeIntl.${name};
        const instance = new Wrapped(undefined${options});
        class Sub extends Wrapped {}
        const sub = new Sub(undefined${options});
        const reflected = Reflect.construct(Wrapped, [undefined${options}], Sub);
        return instance instanceof Wrapped && Object.getPrototypeOf(instance) === Wrapped.prototype &&
          Wrapped.prototype.constructor === Wrapped && sub instanceof Wrapped && sub instanceof Sub &&
          Wrapped.supportedLocalesOf === Native.supportedLocalesOf &&
          Object.getPrototypeOf(reflected) === Sub.prototype && Wrapped.prototype === Native.prototype &&
          JSON.stringify(Wrapped.supportedLocalesOf(['en', 'ja'])) === JSON.stringify(Native.supportedLocalesOf(['en', 'ja']));
      })()
    `), true, name);
    assert.equal(h.run(`
      (() => {
        const call = C => { try { return { value: Reflect.apply(C, undefined, [undefined${options}]) }; } catch (error) { return { error: error.name }; } };
        const native = call(nativeIntl.${name}), wrapped = call(Intl.${name});
        return native.error ? wrapped.error === native.error : wrapped.value instanceof Intl.${name};
      })()
    `), true, `${name}: call without new`);
  }
  for (const expression of ["null", "undefined", "0", "'text'", "{}", "Symbol('x')", "Object.create(Function.prototype)"]) {
    const receiver = h.run(`(${expression})`);
    let nativeError;
    try { foreignToString.call(receiver); } catch (error) { nativeError = error; }
    assert.throws(() => h.run(`Function.prototype.toString.call(${expression})`), {
      name: nativeError.name, message: nativeError.message
    });
  }
}

function checkReturnedMethods(h) {
  for (const [expression, prototype] of [["navigator.userAgentData", "NavigatorUAData.prototype"], ["navigator.geolocation", "Geolocation.prototype"]]) {
    const object = h.run(expression), native = h.run(prototype);
    for (const key of Reflect.ownKeys(object)) {
      const value = object[key];
      if (typeof value !== "function") continue;
      assert.match(foreignToString.call(value), /\[native code\]/, String(key));
      assert.equal(Object.hasOwn(value, "prototype"), false, String(key));
      assert.equal(value.name, native[key].name, String(key));
      assert.equal(value.length, native[key].length, String(key));
      assert.equal(value.toString(), native[key].toString(), String(key));
    }
  }
}

test("page bundle replacements pass a fresh realm's native detector and preserve native metadata", () => {
  const h = page();
  const checked = detect(h, 60);
  for (const name of ["Function.prototype.toString", "Date.prototype.getTimezoneOffset", "Date.prototype.toString", "CanvasRenderingContext2D.prototype.measureText", "Navigator.prototype.userAgent", "Screen.prototype.width", "FontFaceSet.prototype.check", "history.pushState"]) assert.ok(checked.includes(name), name);
  checkReturnedMethods(h);
});

test("Date and Intl constructor proxies preserve native construction, subclassing, statics and callability", () => {
  checkConstructors(page());
});

test("child realms keep native targets and branded getters during parent synchronization", () => {
  const parent = page(), child = page();
  parent.context.child = child.run("globalThis");
  parent.run("new HTMLIFrameElement(child).contentWindow");
  detect(child, 60);
  checkConstructors(child);
  assert.equal(parent.run("screen.width === child.screen.width && navigator.language === child.navigator.language"), true);
});

test("related-page bundle mirrors UAData through native-target methods in its own realm", async () => {
  const p = page(), child = realm();
  child.context.parentRealm = p.run("globalThis");
  child.run("parent = parentRealm; top = parentRealm; location.href = 'about:blank'; document.referrer = parentRealm.location.href");
  child.run(pageRelated);
  detect(child, 55);
  checkConstructors(child);
  checkReturnedMethods(child);
  assert.equal(child.run("Object.getPrototypeOf(navigator.userAgentData) === NavigatorUAData.prototype"), true);
  assert.equal(child.run("JSON.stringify(navigator.userAgentData) === JSON.stringify(parent.navigator.userAgentData)"), true);
  const ua = child.run("navigator.userAgentData");
  const high = await ua.getHighEntropyValues(["architecture", "platformVersion"]);
  assert.equal(Object.getPrototypeOf(high), child.run("Object.prototype"));
});

test("actual Blob worker prelude replacements pass the fresh-realm detector and constructor checks", () => {
  const p = page();
  const source = p.run(`
    new Worker(URL.createObjectURL(new Blob(['self.workerBodyRan = true;'])));
    blobByUrl.get(lastWorkerUrl).parts[1];
  `);
  assert.equal(typeof source, "string");
  assert.match(source, /var sources=new WeakMap/);
  const worker = realm();
  worker.run(source);
  const checked = detect(worker, 45);
  for (const name of ["Function.prototype.toString", "Date.prototype.getTimezoneOffset", "GPUAdapterInfo.prototype.vendor", "Navigator.prototype.language"]) assert.ok(checked.includes(name), name);
  checkConstructors(worker);
  checkReturnedMethods(worker);
  assert.equal(worker.run("new Intl.DateTimeFormat().resolvedOptions().timeZone"), "Asia/Tokyo");
});

test("absent native navigator accessors remain named, nonconstructible synthetic getters", () => {
  const h = realm();
  h.run("delete Navigator.prototype.deviceMemory");
  h.context.__GHOST_BOOTSTRAP_SETTINGS__ = { settings, build: "lite" };
  h.run(pageMain);
  for (const name of ["deviceMemory"]) {
    const getter = h.run(`Object.getOwnPropertyDescriptor(Navigator.prototype, '${name}').get`);
    assert.equal(getter.name, `get ${name}`);
    assert.equal(getter.length, 0);
    assert.equal(Object.hasOwn(getter, "prototype"), false);
    assert.equal(h.run(`Object.hasOwn(navigator, '${name}')`), false);
  }
});

test("locked navigator prototype fields are never shadowed on the instance", () => {
  const h = realm();
  h.run("Object.defineProperty(Navigator.prototype, 'language', {configurable: false})");
  h.context.__GHOST_BOOTSTRAP_SETTINGS__ = { settings, build: "lite" };
  h.run(pageMain);
  assert.equal(h.run("navigator.language"), "en-US");
  assert.equal(h.run("Object.hasOwn(navigator, 'language')"), false);
  const p = page();
  p.context.child = h.run("globalThis");
  p.run("new HTMLIFrameElement(child).contentWindow");
  assert.equal(h.run("navigator.language"), "en-US");
  assert.equal(h.run("Object.hasOwn(navigator, 'language')"), false);
});


test("returned geolocation toJSON proxies serialize fresh plain objects in Chromium's observable order", async () => {
  const h = page();
  const position = await new Promise(resolve => {
    h.context.receivePosition = resolve;
    h.run("navigator.geolocation.getCurrentPosition(receivePosition)");
  });
  const json = position.toJSON();
  assert.notEqual(json, position);
  assert.notEqual(json.coords, position.coords);
  assert.deepEqual(Object.keys(json), ["timestamp", "coords"]);
  assert.deepEqual(Object.keys(json.coords), ["accuracy", "latitude", "longitude", "altitude", "altitudeAccuracy", "heading", "speed"]);
  assert.equal(json.timestamp, position.timestamp);
  for (const key of Object.keys(json.coords)) assert.equal(json.coords[key], position.coords[key]);
  assert.equal(Object.getPrototypeOf(json), h.run("Object.prototype"));
  assert.equal(Object.getPrototypeOf(json.coords), h.run("Object.prototype"));
  assert.equal(JSON.stringify(position), JSON.stringify(json));
  for (const [object, native] of [[position, h.run("GeolocationPosition.prototype.toJSON")], [position.coords, h.run("GeolocationCoordinates.prototype.toJSON")]]) {
    const method = object.toJSON;
    assert.match(foreignToString.call(method), /\[native code\]/);
    for (const key of ["prototype", "arguments", "caller"]) assert.equal(Object.hasOwn(method, key), false);
    assert.equal(method.name, native.name);
    assert.equal(method.length, native.length);
    assert.equal(method.toString(), native.toString());
    assert.notEqual(object.toJSON(), object.toJSON());
  }
});
