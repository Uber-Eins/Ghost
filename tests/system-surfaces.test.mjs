import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PRESET_PROFILES, LOCALE_PRESETS, voicesForProfile, keyboardLayoutForProfile } from "../dist/test/test-api.js";

const nativeWrapperCode = ts.transpileModule(
  readFileSync(new URL("../src/shared/native-wrapper.ts", import.meta.url), "utf8").replaceAll("export ", ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
).outputText;

const profile = (locale, languages = [locale]) => ({ ...PRESET_PROFILES[0], locale, languages });
const layout = (locale) => new Map(keyboardLayoutForProfile(profile(locale)));

test("voicesForProfile gives every preset a truthful Windows primary-language default", () => {
  for (const preset of PRESET_PROFILES) {
    const voices = voicesForProfile(preset, "Win32");
    assert.ok(voices.length > 0, preset.locale);
    assert.equal(voices.filter((voice) => voice.default).length, 1, preset.locale);
    assert.equal(voices[0].default, true);
    assert.equal(voices[0].lang, preset.locale === "en-SG" ? "en-US" : preset.locale);
    assert.equal(voices[0].lang.split("-")[0], preset.locale.split("-")[0]);
    assert.ok(voices.every((voice) => voice.localService && voice.voiceURI === voice.name));
    assert.equal(new Set(voices.map((voice) => voice.voiceURI)).size, voices.length);
  }
});

test("voicesForProfile covers known locale presets without inventing regional voices", () => {
  for (const preset of LOCALE_PRESETS) {
    const voices = voicesForProfile(preset, "Win32");
    assert.ok(voices.length, preset.locale);
    assert.equal(voices.filter((voice) => voice.default).length, 1);
    assert.equal(voices[0].lang.split("-")[0], preset.locale.split("-")[0]);
  }
  assert.deepEqual(voicesForProfile(profile("en-SG"), "Win32"), voicesForProfile(profile("en-US"), "Win32"));
  assert.deepEqual(voicesForProfile(profile("es-US"), "Win32"), voicesForProfile(profile("es-MX"), "Win32"));
  assert.deepEqual(voicesForProfile(profile("xx-ZZ", ["en-US"]), "Win32"), []);
});

test("voicesForProfile ignores generic language tags and deduplicates language packs in Windows registry order", () => {
  const voices = voicesForProfile(profile("ja-JP", ["en-GB", "ja-JP", "ja", "en-US", "en-GB", "unknown-ZZ"]), "Win32");
  assert.deepEqual(new Set(voices.map((voice) => voice.lang)), new Set(["ja-JP", "en-GB", "en-US"]));
  assert.equal(voices.filter((voice) => voice.default).length, 1);
  assert.equal(voices[0].name, "Microsoft Ayumi - Japanese (Japan)");
  // Observed Windows order: default first, then grouped by language and name.
  assert.deepEqual(voices.slice(1, 4).map((voice) => voice.name), [
    "Microsoft George - English (United Kingdom)",
    "Microsoft Hazel - English (United Kingdom)",
    "Microsoft Susan - English (United Kingdom)"
  ]);
  assert.equal(voices.at(-1).name, "Microsoft Sayaka - Japanese (Japan)");
  assert.deepEqual(voicesForProfile(profile("en-us", ["en-US", "en"]), "Win32"), voicesForProfile(profile("en-US"), "Win32"));
});

test("voicesForProfile follows the reported platform rather than the stored platform", () => {
  for (const platform of ["Linux x86_64", "MacIntel", "iPhone", "", "unknown"]) {
    assert.deepEqual(voicesForProfile(PRESET_PROFILES[0], platform), []);
  }
  assert.ok(voicesForProfile({ ...PRESET_PROFILES[0], platform: "Linux x86_64" }, "Win32").length);
});

test("keyboardLayoutForProfile distinguishes QWERTY, AZERTY and QWERTZ", () => {
  const keys = ["KeyQ", "KeyA", "KeyZ", "KeyY"];
  assert.deepEqual(keys.map((code) => layout("en-US").get(code)), ["q", "a", "z", "y"]);
  assert.deepEqual(keys.map((code) => layout("fr-FR").get(code)), ["a", "q", "w", "y"]);
  assert.deepEqual(keys.map((code) => layout("de-DE").get(code)), ["q", "a", "y", "z"]);
  assert.equal(layout("fr-FR").get("Digit1"), "&");
  assert.equal(layout("de-DE").get("BracketLeft"), "ü");
  assert.equal(layout("en-GB").get("Backslash"), "#");
  assert.equal(layout("en-GB").get("IntlBackslash"), "\\");
});

test("keyboardLayoutForProfile models JIS writing-system keys", () => {
  const jis = layout("ja-JP");
  assert.equal(jis.get("IntlRo"), "\\");
  assert.equal(jis.get("IntlYen"), "¥");
  assert.equal(jis.get("Backquote"), "半角/全角");
  assert.equal(jis.get("BracketLeft"), "@");
  assert.equal(jis.get("BracketRight"), "[");
  assert.equal(jis.get("Backslash"), "]");
  assert.equal(jis.get("Quote"), ":");
  assert.equal(jis.has("IntlBackslash"), false);
});

test("keyboardLayoutForProfile uses US for US-layout locales and unknown locales", () => {
  for (const locale of ["zh-CN", "zh-TW", "ko-KR", "en-SG", "unknown-ZZ", ""]) {
    assert.deepEqual(keyboardLayoutForProfile(profile(locale)), keyboardLayoutForProfile(profile("en-US")), locale);
  }
});

test("system surface derivations are deterministic, unique and do not share mutable results", () => {
  const preset = PRESET_PROFILES[0];
  const before = JSON.stringify(preset);
  const voices = voicesForProfile(preset, "Win32");
  voices[0].name = "changed";
  assert.notEqual(voicesForProfile(preset, "Win32")[0].name, "changed");
  for (const locale of ["en-US", "en-GB", "de-DE", "fr-FR", "ja-JP"]) {
    const pairs = keyboardLayoutForProfile(profile(locale));
    assert.equal(new Set(pairs.map(([code]) => code)).size, pairs.length);
    assert.ok(pairs.every(([code, key]) => typeof key === "string" && key.length && code !== "Space"));
    pairs[0][1] = "changed";
    assert.notEqual(keyboardLayoutForProfile(profile(locale))[0][1], "changed");
  }
  assert.equal(JSON.stringify(preset), before);
});

// Execute the actual source-named page patches against branded mock APIs. This
// checks dispatch and masking, not Chromium's implementation or permissions.
const mainText = readFileSync(new URL("../src/content/main.ts", import.meta.url), "utf8");
const mainAst = ts.createSourceFile("main.ts", mainText, ts.ScriptTarget.Latest, true);
const patchNames = new Set(["patchSpeechSynthesis", "patchKeyboard", "patchFunctionToString", "maskAsNative", "defineMethod", "sameJson"]);
const patchDeclarations = [];
function collectPatches(node) {
  if (ts.isFunctionDeclaration(node) && patchNames.has(node.name?.text)) patchDeclarations.push(node.getText(mainAst));
  ts.forEachChild(node, collectPatches);
}
collectPatches(mainAst);
assert.equal(patchDeclarations.length, patchNames.size);
const patchCode = ts.transpileModule(patchDeclarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function patchHarness(locale = "en-US") {
  const context = vm.createContext({ voicesForProfile, keyboardLayoutForProfile, profile: profile(locale) });
  vm.runInContext(`
    var window = globalThis;
    var state = { enabled: true, uaSpoofingEnabled: true, profile };
    var parentIdentity = null;
    var nativeFunctionSources = new WeakMap();
    var patchedSpeechRealms = new WeakSet();
    var patchedKeyboardRealms = new WeakSet();
    var voiceData = new WeakMap();
    var utteranceData = new WeakMap();
    var layoutData = new WeakMap();
    var iteratorData = new WeakMap();
    var SpeechSynthesisVoice = class SpeechSynthesisVoice {
      constructor(data) { voiceData.set(this, data); }
    };
    for (const key of ['name', 'lang', 'voiceURI', 'localService', 'default']) {
      Object.defineProperty(SpeechSynthesisVoice.prototype, key, {
        configurable: true, enumerable: true,
        get: function () { if (!voiceData.has(this)) throw new TypeError('Illegal invocation'); return voiceData.get(this)[key]; }
      });
    }
    var SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
      constructor() { utteranceData.set(this, null); }
      get voice() { if (!utteranceData.has(this)) throw new TypeError('Illegal invocation'); return utteranceData.get(this); }
      set voice(value) {
        if (!utteranceData.has(this) || (value !== null && !voiceData.has(value))) throw new TypeError('Illegal invocation');
        utteranceData.set(this, value);
      }
    };
    var localVoice = new SpeechSynthesisVoice({ name: 'Host local', lang: 'en-US', voiceURI: 'host', localService: true, default: true });
    var remoteVoice = new SpeechSynthesisVoice({ name: 'Browser remote', lang: 'en-US', voiceURI: 'remote', localService: false, default: false });
    var SpeechSynthesis = class SpeechSynthesis {
      getVoices() { if (this !== speechSynthesis) throw new TypeError('Illegal invocation'); return [localVoice, remoteVoice]; }
    };
    var speechSynthesis = new SpeechSynthesis();
    var LayoutIterator = class LayoutIterator {
      constructor(iterator) { iteratorData.set(this, iterator); }
      next() { if (!iteratorData.has(this)) throw new TypeError('Illegal invocation'); return iteratorData.get(this).next(); }
      [Symbol.iterator]() { return this; }
    };
    var KeyboardLayoutMap = class KeyboardLayoutMap {
      constructor(pairs) { layoutData.set(this, new Map(pairs)); }
      get size() { return layoutData.get(this).size; }
      get(key) { return layoutData.get(this).get(String(key)); }
      has(key) { return layoutData.get(this).has(String(key)); }
      entries() { return new LayoutIterator(layoutData.get(this).entries()); }
      keys() { return new LayoutIterator(layoutData.get(this).keys()); }
      values() { return new LayoutIterator(layoutData.get(this).values()); }
      forEach(callback, that) { return layoutData.get(this).forEach((value, key) => callback.call(that, value, key, this)); }
    };
    KeyboardLayoutMap.prototype[Symbol.iterator] = KeyboardLayoutMap.prototype.entries;
    var nativeLayout = new KeyboardLayoutMap([['KeyZ', 'host-z'], ['KeyQ', 'host-q'], ['Backslash', 'host-slash']]);
    var rejection = new Error('Permissions policy');
    var Keyboard = class Keyboard {
      getLayoutMap() {
        if (this !== navigator.keyboard) return Promise.reject(new TypeError('Illegal invocation'));
        return this.reject ? Promise.reject(rejection) : Promise.resolve(nativeLayout);
      }
    };
    var navigator = { platform: 'Win32', keyboard: new Keyboard() };
    var originals = {
      getVoices: SpeechSynthesis.prototype.getVoices,
      voiceGetter: Object.getOwnPropertyDescriptor(SpeechSynthesisVoice.prototype, 'name').get,
      utteranceGetter: Object.getOwnPropertyDescriptor(SpeechSynthesisUtterance.prototype, 'voice').get,
      layoutEntries: KeyboardLayoutMap.prototype.entries,
      layoutNext: LayoutIterator.prototype.next,
      layoutGet: KeyboardLayoutMap.prototype.get,
      layoutSize: Object.getOwnPropertyDescriptor(KeyboardLayoutMap.prototype, 'size').get,
      getLayoutMap: Keyboard.prototype.getLayoutMap,
      toString: Function.prototype.toString
    };
  `, context);
  vm.runInContext(nativeWrapperCode + patchCode, context);
  vm.runInContext("patchFunctionToString(); patchSpeechSynthesis(window); patchKeyboard(window);", context);
  return { context, run: (code) => vm.runInContext(code, context) };
}

test("patchSpeechSynthesis brands local voices, retains remotes and accepts fake utterance voices", () => {
  const h = patchHarness();
  assert.equal(h.run("speechSynthesis.getVoices().at(-1) === remoteVoice"), true);
  assert.equal(h.run("speechSynthesis.getVoices().includes(localVoice)"), false);
  assert.equal(h.run("var fake = speechSynthesis.getVoices()[0]; Object.getPrototypeOf(fake) === SpeechSynthesisVoice.prototype"), true);
  assert.equal(h.run("Reflect.ownKeys(fake).length"), 0);
  assert.equal(h.run("fake === speechSynthesis.getVoices()[0]"), true);
  assert.equal(h.run("fake.name"), "Microsoft David - English (United States)");
  assert.equal(h.run("localVoice.name"), "Host local");
  assert.equal(h.run("var utterance = new SpeechSynthesisUtterance(); utterance.voice = fake; utterance.voice === fake"), true);
  assert.equal(h.run("originals.utteranceGetter.call(utterance) === localVoice"), true);
  assert.equal(h.run("state.enabled = false; utterance.voice = fake; utterance.voice === localVoice"), true);
  h.run("state.enabled = true");
  assert.equal(h.run("utterance.voice = remoteVoice; utterance.voice === remoteVoice"), true);
  assert.equal(h.run("state.profile.locale = 'ja-JP'; state.profile.languages = ['ja-JP']; utterance.voice = speechSynthesis.getVoices()[0]; originals.utteranceGetter.call(utterance) === null"), true);
  assert.throws(() => h.run("originals.voiceGetter.call({})"), { name: "TypeError" });
  assert.throws(() => h.run("Object.getOwnPropertyDescriptor(SpeechSynthesisVoice.prototype, 'name').get.call({})"), { name: "TypeError" });
  assert.throws(() => h.run("speechSynthesis.getVoices.call({})"), { name: "TypeError" });
});

test("patchSpeechSynthesis leaves delegated, native-UA, macOS and disabled results native", () => {
  const h = patchHarness();
  for (const setup of ["state.enabled = false", "state.enabled = true; state.uaSpoofingEnabled = false", "state.uaSpoofingEnabled = true; state.profile.uaMode = 'native'", "state.profile.uaMode = 'desktop-chromium'; navigator.platform = 'MacIntel'"]) {
    h.run(setup);
    assert.equal(h.run("speechSynthesis.getVoices()[0] === localVoice"), true, setup);
  }
  h.run("navigator.platform = 'Linux x86_64'");
  assert.equal(h.run("speechSynthesis.getVoices().length"), 1);
  assert.equal(h.run("speechSynthesis.getVoices()[0] === remoteVoice"), true);
});

test("patchSpeechSynthesis mirrors a related parent's public list even when UA values match the host", () => {
  const h = patchHarness();
  h.run("state.uaSpoofingEnabled = false; parentIdentity = { localVoices: () => voicesForProfile({locale:'ja-JP', languages:['ja-JP']}, 'Win32') }");
  assert.equal(h.run("speechSynthesis.getVoices()[0].lang"), "ja-JP");
  assert.equal(h.run("Object.getPrototypeOf(speechSynthesis.getVoices()[0]) === SpeechSynthesisVoice.prototype"), true);
  h.run("parentIdentity.localVoices = () => [{name:localVoice.name, lang:localVoice.lang, voiceURI:localVoice.voiceURI, localService:localVoice.localService, default:localVoice.default}]");
  assert.equal(h.run("speechSynthesis.getVoices()[0] === localVoice"), true);
});

test("patchKeyboard preserves native success/rejection, brands maps and iterators, and implements maplike methods", async () => {
  const h = patchHarness("fr-FR");
  await h.run("navigator.keyboard.getLayoutMap().then(map => { globalThis.fakeLayout = map; })");
  assert.equal(h.run("Object.getPrototypeOf(fakeLayout) === KeyboardLayoutMap.prototype"), true);
  assert.equal(h.run("Reflect.ownKeys(fakeLayout).length"), 0);
  assert.equal(h.run("fakeLayout.get('KeyQ')"), "a");
  assert.equal(h.run("fakeLayout.has('KeyQ') && !fakeLayout.has('unknown')"), true);
  assert.equal(h.run("JSON.stringify(Array.from(fakeLayout.keys()).slice(0, 3))"), '["KeyZ","KeyQ","Backslash"]');
  assert.equal(h.run("fakeLayout.size"), layout("fr-FR").size);
  assert.equal(h.run("JSON.stringify(Array.from(fakeLayout)) === JSON.stringify(Array.from(fakeLayout.entries()))"), true);
  assert.equal(h.run("Array.from(fakeLayout.values()).join() === Array.from(fakeLayout).map(pair => pair[1]).join()"), true);
  assert.equal(h.run("var seen = []; var that = {}; fakeLayout.forEach(function(v, k, m) { seen.push(this === that && m === fakeLayout && v === m.get(k)); }, that); seen.length === fakeLayout.size && seen.every(Boolean)"), true);
  assert.equal(h.run("Object.getPrototypeOf(fakeLayout.entries()) === Object.getPrototypeOf(nativeLayout.entries())"), true);
  assert.equal(h.run("KeyboardLayoutMap.prototype.entries === KeyboardLayoutMap.prototype[Symbol.iterator]"), true);
  assert.equal(h.run("nativeLayout.get('KeyQ')"), "host-q");
  assert.equal(h.run("Array.from(nativeLayout.keys()).join()"), "KeyZ,KeyQ,Backslash");
  assert.throws(() => h.run("fakeLayout.get()"), { name: "TypeError" });
  assert.throws(() => h.run("fakeLayout.get(Symbol())"), { name: "TypeError" });
  assert.throws(() => h.run("fakeLayout.forEach(null)"), { name: "TypeError" });
  assert.throws(() => h.run("KeyboardLayoutMap.prototype.get.call({}, 'KeyQ')"), { name: "TypeError" });
  h.run("navigator.keyboard.reject = true");
  await assert.rejects(h.run("navigator.keyboard.getLayoutMap()"), (error) => error === h.run("rejection"));
  h.run("navigator.keyboard.reject = false; state.enabled = false");
  assert.equal(await h.run("navigator.keyboard.getLayoutMap().then(map => map === nativeLayout)"), true);
});

test("system surface wrappers preserve native function metadata and skip absent APIs", () => {
  const h = patchHarness();
  assert.equal(h.run(`[
    [speechSynthesis.getVoices, originals.getVoices],
    [Object.getOwnPropertyDescriptor(SpeechSynthesisVoice.prototype, 'name').get, originals.voiceGetter],
    [navigator.keyboard.getLayoutMap, originals.getLayoutMap],
    [KeyboardLayoutMap.prototype.get, originals.layoutGet],
    [Object.getOwnPropertyDescriptor(KeyboardLayoutMap.prototype, 'size').get, originals.layoutSize]
  ].every(([wrapped, native]) => wrapped.name === native.name && wrapped.length === native.length && wrapped.toString() === originals.toString.call(native))`), true);
  h.run("speechSynthesis = undefined; navigator.keyboard = undefined; patchSpeechSynthesis(window); patchKeyboard(window)");
});
