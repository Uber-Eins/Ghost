import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PRESET_PROFILES, WEBGL_SPOOF_PRESETS, webgpuAdapterInfoForProfile, webgpuAdapterInfoForWebgl } from "../dist/test/test-api.js";

const nativeWrapperCode = ts.transpileModule(
  readFileSync(new URL("../src/shared/native-wrapper.ts", import.meta.url), "utf8").replaceAll("export ", ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
).outputText;

const emptyInfo = { vendor: "", architecture: "", device: "", description: "" };
const expectedPresets = [
  ["", ""], ["amd", "gcn-2"], ["apple", "metal-3"], ["intel", "gen-9"],
  ["", ""], ["nvidia", "maxwell"], ["qualcomm", "adreno-6xx"]
];

test("webgpuAdapterInfoForWebgl covers every Helium preset including blank and llvmpipe", () => {
  assert.equal(WEBGL_SPOOF_PRESETS.length, expectedPresets.length);
  for (const [index, { vendor, renderer }] of WEBGL_SPOOF_PRESETS.entries()) {
    const [gpuVendor, architecture] = expectedPresets[index];
    assert.deepEqual(webgpuAdapterInfoForWebgl(vendor, renderer), { ...emptyInfo, vendor: gpuVendor, architecture }, renderer);
  }
  assert.deepEqual(webgpuAdapterInfoForWebgl("", ""), emptyInfo);
  assert.deepEqual(webgpuAdapterInfoForWebgl("Mesa Intel", "llvmpipe"), emptyInfo);
});

test("webgpuAdapterInfoForWebgl preserves Ghost profile derivation", () => {
  for (const profile of PRESET_PROFILES) {
    assert.deepEqual(webgpuAdapterInfoForWebgl(profile.webglVendor, profile.webglRenderer), webgpuAdapterInfoForProfile(profile));
  }
});

// Source-named patches and branded mocks check dispatch, not browser injection
// timing or Chromium's actual GPU/media implementations.
function sourceFunctions(path, names) {
  const text = readFileSync(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const declarations = [];
  function collect(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) declarations.push(node.getText(ast).replace(/^export /, ""));
    ts.forEachChild(node, collect);
  }
  collect(ast);
  assert.equal(declarations.length, names.length);
  return ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
const patchCode = sourceFunctions("../src/content/main.ts", [
  "patchWebGPU", "webgpuInfoForRealm", "lazyWebglInfoReader", "patchWebGL", "patchWebGLPrototype",
  "nativeMappingGetter", "patchMediaDevices", "patchFunctionToString", "maskAsNative", "defineMethod"
]);
const workerCode = sourceFunctions("../src/shared/worker-prelude.ts", ["workerIdentityPrelude", "workerNavigatorPrelude", "workerWebGLPrelude"]);

function harness(mediaDeviceListEnabled = true) {
  const context = vm.createContext({ profile: structuredClone(PRESET_PROFILES[0]), webgpuAdapterInfoForProfile, webgpuAdapterInfoForWebgl, mediaDeviceListEnabled });
  const run = (text) => vm.runInContext(text, context);
  run(`
    var window = globalThis, self = globalThis;
    var state = { enabled: true, webglInfoSpoofingEnabled: false, mediaDeviceListEnabled, profile };
    var parentIdentity = null;
    var nativeFunctionSources = new WeakMap();
    var patchedMediaRealms = new WeakSet(), patchedWebglRealms = new WeakSet(), patchedWebgpuRealms = new WeakSet();
    var webgpuInfoReaders = new WeakMap();
    var creates = 0, queries = 0, failWebgl = false, missingExtension = false;
    var pair = { vendor: 'AMD', renderer: 'Radeon R9 200 Series, or similar' };
    var gpuData = new WeakSet();
    var GPUAdapterInfo = class GPUAdapterInfo { constructor() { gpuData.add(this); } };
    for (const key of ['vendor', 'architecture', 'device', 'description']) {
      Object.defineProperty(GPUAdapterInfo.prototype, key, { configurable: true, enumerable: true,
        get: function () { if (!gpuData.has(this)) throw new TypeError('Illegal invocation'); return 'native-' + key; }
      });
    }
    var info = new GPUAdapterInfo();
    var WebGLRenderingContext = class WebGLRenderingContext {
      getParameter(key) { if (!(this instanceof WebGLRenderingContext)) throw new TypeError('Illegal invocation'); queries++; return key === 0x9245 ? pair.vendor : key === 0x9246 ? pair.renderer : 'WebKit'; }
      getExtension(name) { return missingExtension ? null : {}; }
    };
    var HTMLCanvasElement = class HTMLCanvasElement {
      getContext(kind) { if (failWebgl) throw new Error('WebGL blocked'); return new WebGLRenderingContext(); }
    };
    var document = { createElement() { creates++; return new HTMLCanvasElement(); } };
    var mediaData = new WeakMap();
    var MediaDeviceInfo = class MediaDeviceInfo {
      constructor(kind, deviceId = '', label = '', groupId = '') { mediaData.set(this, { deviceId, kind, label, groupId }); }
      toJSON() { if (!mediaData.has(this)) throw new TypeError('Illegal invocation'); return { ...mediaData.get(this) }; }
    };
    for (const key of ['deviceId', 'kind', 'label', 'groupId']) {
      Object.defineProperty(MediaDeviceInfo.prototype, key, { configurable: true, enumerable: true,
        get: function () { if (!mediaData.has(this)) throw new TypeError('Illegal invocation'); return mediaData.get(this)[key]; }
      });
    }
    var InputDeviceInfo = class InputDeviceInfo extends MediaDeviceInfo {
      getCapabilities() { if (!mediaData.has(this) || this.kind === 'audiooutput') throw new TypeError('Illegal invocation'); return {}; }
    };
    var nativeDevices = [], calls = 0, mediaError = null;
    var MediaDevices = class MediaDevices {
      enumerateDevices() { if (this !== mediaDevices) return Promise.reject(new TypeError('Illegal invocation')); calls++; return mediaError ? Promise.reject(mediaError) : Promise.resolve(nativeDevices); }
    };
    var mediaDevices = new MediaDevices();
    var navigator = new (class Navigator {})();
    var originals = { enumerate: MediaDevices.prototype.enumerateDevices, toJSON: MediaDeviceInfo.prototype.toJSON,
      capabilities: InputDeviceInfo.prototype.getCapabilities,
      kind: Object.getOwnPropertyDescriptor(MediaDeviceInfo.prototype, 'kind').get,
      vendor: Object.getOwnPropertyDescriptor(GPUAdapterInfo.prototype, 'vendor').get,
      webgl: WebGLRenderingContext.prototype.getParameter };
  `);
  run(nativeWrapperCode + patchCode);
  run("patchFunctionToString()");
  return { context, run, json: (text) => JSON.parse(run(`JSON.stringify(${text})`)) };
}

test("patchWebGPU lazily reads delegated WebGL once and never reveals native adapter info", () => {
  const h = harness();
  h.run("patchWebGPU(window)");
  assert.equal(h.run("creates"), 0);
  assert.equal(h.run("info.vendor"), "amd");
  assert.equal(h.run("info.architecture"), "gcn-2");
  assert.equal(h.run("creates"), 1);
  assert.equal(h.run("queries"), 2);
  h.run("pair = { vendor: 'NVIDIA', renderer: 'GeForce GTX 980' }");
  assert.equal(h.run("info.vendor"), "amd");
  assert.equal(h.run("info.device + info.description"), "");
  assert.equal(h.run("creates"), 1);
  assert.equal(h.run("Object.getOwnPropertyDescriptor(GPUAdapterInfo.prototype, 'vendor').get.toString() === originals.vendor.toString()"), true);
  assert.throws(() => h.run("Object.getOwnPropertyDescriptor(GPUAdapterInfo.prototype, 'vendor').get.call({})"), { name: "TypeError" });
  h.run("state.enabled = false");
  assert.equal(h.run("info.vendor"), "native-vendor");
});

test("patchWebGPU uses empty info for failed, unavailable or unknown delegated WebGL", () => {
  for (const setup of ["failWebgl = true", "missingExtension = true", "pair = { vendor: ' ', renderer: ' ' }", "pair = { vendor: 'Mesa', renderer: 'llvmpipe' }"]) {
    const h = harness();
    h.run(`${setup}; patchWebGPU(window)`);
    assert.deepEqual(h.json("Object.fromEntries(['vendor', 'architecture', 'device', 'description'].map(key => [key, info[key]]))"), emptyInfo);
    assert.equal(h.run("creates"), 1);
  }
});

test("patchWebGPU Ghost-owned path stays profile-derived without allocating WebGL", () => {
  const h = harness();
  h.run("state.webglInfoSpoofingEnabled = true; patchWebGL(); patchWebGPU(window)");
  const expected = webgpuAdapterInfoForProfile(PRESET_PROFILES[0]);
  assert.equal(h.run("info.vendor"), expected.vendor);
  assert.equal(h.run("info.architecture"), expected.architecture);
  assert.equal(h.run("creates"), 0);
  assert.equal(h.run("new WebGLRenderingContext().getParameter(0x9246)"), PRESET_PROFILES[0].webglRenderer);
});

test("patchWebGPU caches delegated WebGL separately for each realm", () => {
  const page = harness(), child = harness();
  page.context.child = child.run("window");
  page.run("patchWebGPU(window); patchWebGPU(child)");
  assert.equal(page.run("creates"), 0);
  assert.equal(child.run("creates"), 0);
  assert.equal(child.run("info.vendor"), "amd");
  assert.equal(page.run("creates"), 0);
  assert.equal(child.run("creates"), 1);
  page.run("pair = { vendor: 'Qualcomm', renderer: 'Adreno (TM) 610' }");
  assert.equal(page.run("info.architecture"), "adreno-6xx");
  assert.equal(page.run("creates"), 1);
});

test("lazyWebglInfoReader lets related frames mirror the parent's public Ghost or Helium pair", () => {
  for (const ghostOwned of [false, true]) {
    const parent = harness(), child = harness();
    parent.run(`state.webglInfoSpoofingEnabled = ${ghostOwned}; if (state.webglInfoSpoofingEnabled) patchWebGL()`);
    child.context.parentRealm = parent.run("window");
    child.run("parentIdentity = { webglInfo: lazyWebglInfoReader(parentRealm) }; state.webglInfoSpoofingEnabled = true; patchWebGL(); patchWebGPU(window)");
    assert.equal(parent.run("creates"), 0);
    const expected = ghostOwned ? webgpuAdapterInfoForProfile(PRESET_PROFILES[0]) : { vendor: "amd", architecture: "gcn-2" };
    assert.equal(child.run("info.architecture"), expected.architecture);
    assert.equal(child.run("new WebGLRenderingContext().getParameter(0x9246)"), ghostOwned ? PRESET_PROFILES[0].webglRenderer : "Radeon R9 200 Series, or similar");
    assert.equal(parent.run("creates"), 1);
    assert.equal(child.run("creates"), 0);
  }
  const h = harness();
  h.run("var reader = lazyWebglInfoReader(window); document = { createElement() { throw new Error('navigated') } }; parentIdentity = { webglInfo: reader }; state.webglInfoSpoofingEnabled = true; patchWebGL(); patchWebGPU(window)");
  assert.equal(h.run("info.vendor"), "");
  assert.equal(h.run("new WebGLRenderingContext().getParameter(0x9246)"), "");
});

test("workerIdentityPrelude covers WebGPU from page-derived info even with Helium WebGL ownership", () => {
  const builder = harness();
  builder.run(workerCode);
  builder.run("var __GHOST_WORKER_TIME_PATCH__ = ''");
  for (const supplied of [{ ...emptyInfo, vendor: "amd", architecture: "gcn-2" }, emptyInfo]) {
    builder.context.supplied = supplied;
    const prelude = builder.run("workerIdentityPrelude({ profile, baseUserAgent: '', uaSpoofingEnabled: false, webglInfoSpoofingEnabled: false, webgpuAdapterInfo: supplied })");
    const worker = harness();
    worker.run(prelude);
    assert.equal(worker.run("info.vendor"), supplied.vendor);
    assert.equal(worker.run("info.architecture"), supplied.architecture);
    assert.equal(worker.run("info.device + info.description"), "");
    assert.equal(worker.run("creates"), 0);
    assert.equal(worker.run("WebGLRenderingContext.prototype.getParameter === originals.webgl"), true);
    assert.throws(() => worker.run("Object.getOwnPropertyDescriptor(GPUAdapterInfo.prototype, 'vendor').get.call({})"), { name: "TypeError" });
  }
});

test("patchMediaDevices returns fixed anonymous kinds, reuses native entries and masks fakes", async () => {
  const h = harness();
  h.run("patchMediaDevices(window); nativeDevices = [new InputDeviceInfo('videoinput')]");
  h.context.devices = await h.run("mediaDevices.enumerateDevices()");
  assert.deepEqual(h.json("devices.map(device => device.kind)"), ["audioinput", "videoinput", "audiooutput"]);
  assert.equal(h.run("calls"), 1);
  assert.equal(h.run("devices[1] === nativeDevices[0]"), true);
  assert.equal(h.run("devices[0] instanceof InputDeviceInfo && devices[1] instanceof InputDeviceInfo && devices[2] instanceof MediaDeviceInfo && !(devices[2] instanceof InputDeviceInfo)"), true);
  assert.deepEqual(h.json("devices.map(device => Reflect.ownKeys(device))"), [[], [], []]);
  assert.deepEqual(h.json("devices.map(device => device.toJSON())"), ["audioinput", "videoinput", "audiooutput"].map(kind => ({ deviceId: "", kind, label: "", groupId: "" })));
  assert.deepEqual(h.json("Object.keys(devices[0].toJSON())"), ["deviceId", "kind", "label", "groupId"]);
  assert.deepEqual(h.json("devices[0].getCapabilities()"), {});
  assert.equal(h.run("Object.getPrototypeOf(devices[0].toJSON()) === Object.prototype && Object.getPrototypeOf(devices[0].getCapabilities()) === Object.prototype"), true);
  for (const [current, original] of [["MediaDevices.prototype.enumerateDevices", "enumerate"], ["MediaDeviceInfo.prototype.toJSON", "toJSON"], ["InputDeviceInfo.prototype.getCapabilities", "capabilities"], ["Object.getOwnPropertyDescriptor(MediaDeviceInfo.prototype, 'kind').get", "kind"]]) {
    assert.equal(h.run(`${current}.toString() === originals.${original}.toString()`), true);
    assert.equal(h.run(`${current}.name === originals.${original}.name && ${current}.length === originals.${original}.length`), true);
  }
  assert.throws(() => h.run("MediaDeviceInfo.prototype.toJSON.call({})"), { name: "TypeError" });
  assert.throws(() => h.run("InputDeviceInfo.prototype.getCapabilities.call(devices[2])"), { name: "TypeError" });
  assert.throws(() => h.run("Object.getOwnPropertyDescriptor(MediaDeviceInfo.prototype, 'kind').get.call({})"), { name: "TypeError" });
});

test("patchMediaDevices covers empty lists, canonical order and every existing anonymous kind", async () => {
  for (const kinds of [[], ["audiooutput"], ["videoinput", "audiooutput", "audioinput"], ["audioinput", "audioinput"]]) {
    const h = harness();
    h.context.kinds = kinds;
    h.run("patchMediaDevices(window); nativeDevices = kinds.map(kind => new (kind === 'audiooutput' ? MediaDeviceInfo : InputDeviceInfo)(kind))");
    h.context.devices = await h.run("mediaDevices.enumerateDevices()");
    assert.deepEqual(h.json("devices.map(device => device.kind)"), ["audioinput", "videoinput", "audiooutput"]);
    assert.equal(h.run("devices.every(device => !nativeDevices.some(native => native.kind === device.kind) || device === nativeDevices.find(native => native.kind === device.kind))"), true);
  }
});

test("patchMediaDevices preserves full native results for any label/deviceId and when disabled", async () => {
  for (const setup of ["new InputDeviceInfo('audioinput', 'id')", "new InputDeviceInfo('videoinput', '', 'camera')", "new MediaDeviceInfo('audiooutput', 'speaker')"]) {
    const h = harness();
    h.run(`patchMediaDevices(window); nativeDevices = [new InputDeviceInfo('audioinput'), ${setup}]`);
    const devices = await h.run("mediaDevices.enumerateDevices()");
    assert.equal(devices, h.run("nativeDevices"));
  }
  const h = harness();
  h.run("patchMediaDevices(window); state.enabled = false");
  assert.equal(await h.run("mediaDevices.enumerateDevices()"), h.run("nativeDevices"));
});

test("patchMediaDevices preserves native rejection and receiver validation", async () => {
  const h = harness();
  h.run("patchMediaDevices(window); mediaError = new Error('permission policy')");
  await assert.rejects(h.run("mediaDevices.enumerateDevices()"), /permission policy/);
  await assert.rejects(h.run("MediaDevices.prototype.enumerateDevices.call({})"), { name: "TypeError" });
});

test("patchMediaDevices makes child-realm arrays, objects and prototypes", async () => {
  const parent = harness(), child = harness();
  parent.context.child = child.run("window");
  parent.run("patchMediaDevices(child)");
  child.context.devices = await child.run("mediaDevices.enumerateDevices()");
  assert.equal(child.run("Object.getPrototypeOf(devices) === Array.prototype && Object.getPrototypeOf(devices[0]) === InputDeviceInfo.prototype && Object.getPrototypeOf(devices[2]) === MediaDeviceInfo.prototype"), true);
  assert.equal(child.run("Object.getPrototypeOf(devices[0].getCapabilities()) === Object.prototype && Object.getPrototypeOf(devices[2].toJSON()) === Object.prototype"), true);
});

const installCode = sourceFunctions("../src/content/main.ts", ["install"]);
const pageWorkerCode = sourceFunctions("../src/content/main.ts", ["workerIdentityPrelude"]);

test("install covers delegated WebGPU and media but leaves excluded profile surfaces native", () => {
  for (const enabled of [false, true]) {
    const h = harness();
    h.run(`
      var installedSurfaceOwnership = { profileProtection: ${enabled}, webglInfo: false };
      var callsAtInstall = [];
      ${["patchNavigator", "patchSpeechSynthesis", "patchKeyboard", "patchScreen", "patchRelatedWindowAccess", "installTimePatches", "patchGeolocation", "patchFontFaceSet", "patchCanvas", "patchWorkers"].map(name => `function ${name}() { callsAtInstall.push('${name}'); }`).join("\n")}
    `);
    h.run(installCode);
    h.run("install()");
    assert.equal(h.run("MediaDevices.prototype.enumerateDevices !== originals.enumerate"), enabled);
    assert.equal(h.run("Object.getOwnPropertyDescriptor(GPUAdapterInfo.prototype, 'vendor').get !== originals.vendor"), enabled);
    assert.equal(h.run("creates"), 0);
    assert.equal(h.run("info.vendor"), enabled ? "amd" : "native-vendor");
  }
});

test("page workerIdentityPrelude passes the derived page GPU info and related-parent WebGL pair", () => {
  for (const mirrored of [false, true]) {
    const h = harness();
    h.run(`
      var captured;
      function buildWorkerIdentityPrelude(options) { captured = options; return 'prelude'; }
      function spoofingBaseUserAgentString() { return ''; }
      state.uaSpoofingEnabled = false;
      if (${mirrored}) {
        parentIdentity = { webglInfo: lazyWebglInfoReader(window) };
        state.webglInfoSpoofingEnabled = true;
      }
    `);
    h.run(pageWorkerCode);
    assert.equal(h.run("creates"), 0);
    assert.equal(h.run("workerIdentityPrelude()"), "prelude");
    assert.deepEqual(h.json("captured.webgpuAdapterInfo"), { ...emptyInfo, vendor: "amd", architecture: "gcn-2" });
    assert.equal(h.run("captured.webglInfoSpoofingEnabled"), mirrored);
    if (mirrored) assert.equal(h.run("captured.profile.webglRenderer"), "Radeon R9 200 Series, or similar");
    assert.equal(h.run("creates"), 1);
  }
});


test("patchMediaDevices keeps all media prototypes native when the global list setting is off", async () => {
  const h = harness(false);
  h.run("patchMediaDevices(window)");
  assert.equal(h.run("MediaDevices.prototype.enumerateDevices === originals.enumerate"), true);
  assert.equal(h.run("MediaDeviceInfo.prototype.toJSON === originals.toJSON"), true);
  assert.equal(h.run("Object.getOwnPropertyDescriptor(MediaDeviceInfo.prototype, 'kind').get === originals.kind"), true);
  assert.equal(await h.run("mediaDevices.enumerateDevices()"), h.run("nativeDevices"));
});

test("patchMediaDevices mirrors parent kinds without returning parent-realm devices", async () => {
  for (const kinds of [[], ["videoinput"], ["audioinput", "videoinput", "audiooutput"], null]) {
    const h = harness();
    h.context.parentKinds = kinds;
    h.run("nativeDevices = [new InputDeviceInfo('videoinput')]; parentIdentity = { mediaDeviceKinds: async () => parentKinds }; patchMediaDevices(window)");
    h.context.devices = await h.run("mediaDevices.enumerateDevices()");
    if (kinds?.length === 1) assert.equal(h.run("devices === nativeDevices"), true);
    else assert.deepEqual(h.json("devices.map(device => device.kind)"), ["audioinput", "videoinput", "audiooutput"]);
    assert.equal(h.run("devices instanceof Array && devices.every(device => device instanceof MediaDeviceInfo)"), true);
  }
});
