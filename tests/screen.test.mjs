import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PRESET_PROFILES, DEFAULT_SETTINGS, normalizeSettings, resolveProfile, screenForProfile, rewriteScreenMediaQuery } from "../dist/test/test-api.js";

const nativeWrapperCode = ts.transpileModule(
  readFileSync(new URL("../src/shared/native-wrapper.ts", import.meta.url), "utf8").replaceAll("export ", ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
).outputText;

const profile = PRESET_PROFILES[0];
const smallOuter = { width: 1000, height: 600 };
const derive = (changes = {}, outer = smallOuter) => screenForProfile({ ...profile, ...changes }, "Win32", outer);
const resolutions = [[1280, 720], [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1920, 1080], [2560, 1440], [2560, 1600], [3840, 2160]];

test("screenForProfile fixes a resolution per profile id independently of site and session", () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, siteProfiles: { "*": profile.id } });
  const expected = derive();
  const seeds = new Set();
  for (const site of ["https://one.example", "https://two.example"]) {
    for (const salt of ["session-one", "session-two"]) {
      const resolved = resolveProfile(site, settings, "lite", 0, site, salt);
      seeds.add(resolved.seed);
      assert.deepEqual(screenForProfile(resolved.profile, "Win32", smallOuter), expected);
    }
  }
  assert.equal(seeds.size, 4);
  assert.deepEqual(derive({ locale: "ja-JP", languages: ["ja-JP"], timezoneId: "Asia/Tokyo" }), expected);
  expected.width = 1;
  assert.notEqual(derive().width, 1);
  assert.ok(new Set(PRESET_PROFILES.map((preset) => screenForProfile(preset, "Win32", smallOuter).width)).size > 1);
});

test("screenForProfile bumps to the smallest fitting entry and rounds only beyond the list", () => {
  const initial = derive();
  for (const outer of [{ width: initial.width + 1, height: 600 }, { width: 1000, height: initial.availHeight + 1 }, { width: 2500, height: 1500 }, { width: 3800, height: 2100 }]) {
    const expected = resolutions.find(([width, height]) => width >= outer.width && height - 40 >= outer.height);
    const actual = derive({}, outer);
    assert.deepEqual([actual.width, actual.height], expected);
    assert.ok(actual.width >= outer.width && actual.availHeight >= outer.height);
  }
  const enormous = derive({ platformVersion: "13" }, { width: 4001, height: 2201 });
  assert.deepEqual([enormous.width, enormous.height], [4080, 2320]);
  assert.ok(enormous.availHeight >= 2201);
});

test("screenForProfile keeps work area within bounds and uses the reported Windows version", () => {
  for (const preset of PRESET_PROFILES) {
    for (const [version, taskbar] of [["", 40], ["10.0.0", 40], ["12.9.0", 40], ["13", 48], [" 15.0.0 ", 48], ["invalid", 40]]) {
      const screen = screenForProfile({ ...preset, platformVersion: version }, "Win32", smallOuter);
      assert.equal(screen.height - screen.availHeight, taskbar, `${preset.id}: ${version}`);
      assert.equal(screen.availWidth, screen.width);
      assert.equal(screen.availLeft, 0);
      assert.equal(screen.availTop, 0);
      assert.ok(screen.availHeight > 0 && screen.availHeight <= screen.height);
    }
  }
  assert.equal(derive({ platform: "Linux x86_64", platformVersion: "13" }).height - derive({ platform: "Linux x86_64", platformVersion: "13" }).availHeight, 48);
});

test("screenForProfile leaves non-Windows and native-UA profiles native", () => {
  for (const platform of ["Linux x86_64", "MacIntel", "iPhone", "", "unknown"]) {
    assert.equal(screenForProfile(profile, platform, smallOuter), null);
  }
  assert.equal(derive({ uaMode: "native" }), null);
});

const screen = { width: 1920, height: 1080 };
const yes = "(min-resolution: 0dppx)";
const no = "(max-resolution: 0dppx)";
test("rewriteScreenMediaQuery handles colon, min/max and numeric aspect ratios", () => {
  for (const [query, expected] of [
    ["(device-width: 1920px)", yes], ["(device-height: 900px)", no],
    ["(MIN-device-width: 1900PX)", yes], ["(max-device-height: 1079px)", no],
    ["(device-aspect-ratio: 16/9)", yes], ["(min-device-aspect-ratio: 1.5)", yes],
    ["(max-device-aspect-ratio: 1)", no],
    ["screen and (device-width: 1920px) and (device-height: 1080px), (color)", `screen and ${yes} and ${yes}, (color)`],
    ["not all and (device-width: 1px)", `not all and ${no}`]
  ]) assert.equal(rewriteScreenMediaQuery(query, screen), expected, query);
});

test("rewriteScreenMediaQuery handles one-sided and chained range syntax", () => {
  for (const [query, expected] of [
    ["(device-width >= 1920px)", yes], ["(1920px < device-width)", no],
    ["(1000px < device-width <= 2000px)", yes], ["(2000px >= device-width > 1920px)", no],
    ["(device-height = 1080px)", yes], ["(16/9 = device-aspect-ratio)", yes],
    ["(1 < device-aspect-ratio < 2)", yes]
  ]) assert.equal(rewriteScreenMediaQuery(query, screen), expected, query);
});

test("rewriteScreenMediaQuery leaves other features, unsupported units and malformed expressions native", () => {
  for (const query of ["(width: 100px)", "(prefers-color-scheme: dark)", "(device-width: 10em)", "(device-height: 1in)",
    "(device-width: -1px)", "(device-width: 1920px garbage)", "(device-width)", "(device-aspect-ratio: 1/0)",
    "(1000px < device-width > 2000px)", "(1px = device-width = 1px)", "(min-device-width >= 1px)",
    "(device-width = device-width)", "(device-width == 1920px)", "(10rem < device-width < 20rem)"]) {
    assert.equal(rewriteScreenMediaQuery(query, screen), query);
  }
});

// Source-named patches, branded mocks: dispatch/masking tests, not a substitute
// for Chromium's media-query parsing or extension/frame injection timing.
const mainText = readFileSync(new URL("../src/content/main.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("main.ts", mainText, ts.ScriptTarget.Latest, true);
const names = new Set(["patchScreen", "patchFunctionToString", "maskAsNative", "defineMethod", "applyResolvedProfile", "profileSignature"]);
const declarations = [];
function collect(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) declarations.push(node.getText(ast));
  ts.forEachChild(node, collect);
}
collect(ast);
assert.equal(declarations.length, names.size);
const code = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness() {
  const context = vm.createContext({ profile: structuredClone(profile), screenForProfile, rewriteScreenMediaQuery });
  vm.runInContext(`
    var window = globalThis;
    var state = { enabled: true, uaSpoofingEnabled: true, profile };
    var parentIdentity = null;
    var patchedScreenRealms = new WeakSet();
    var nativeFunctionSources = new WeakMap();
    var refreshScreenProfile = null;
    var navigator = { platform: 'Win32' };
    var outerWidth = 1000, outerHeight = 600, devicePixelRatio = 2;
    var screenData = new WeakMap();
    var Screen = class Screen { constructor() { screenData.set(this, { width: 5000, height: 3000, availWidth: 5000, availHeight: 2950, availLeft: 5000, availTop: 100, isExtended: true, colorDepth: 24 }); } };
    for (const key of ['width', 'height', 'availWidth', 'availHeight', 'availLeft', 'availTop', 'isExtended', 'colorDepth']) {
      Object.defineProperty(Screen.prototype, key, { configurable: true, enumerable: true,
        get: function () { if (!screenData.has(this)) throw new TypeError('Illegal invocation'); return screenData.get(this)[key]; }
      });
    }
    var screen = new Screen();
    var mediaData = new WeakMap();
    var MediaQueryList = class MediaQueryList {
      constructor(media) { mediaData.set(this, media); }
      get media() { if (!mediaData.has(this)) throw new TypeError('Illegal invocation'); return mediaData.get(this); }
      get matches() { return !mediaData.get(this).includes('(max-resolution: 0dppx)'); }
    };
    var matchMedia = function matchMedia(query) { return new MediaQueryList(String(query)); };
    var originals = { width: Object.getOwnPropertyDescriptor(Screen.prototype, 'width'), matchMedia,
      media: Object.getOwnPropertyDescriptor(MediaQueryList.prototype, 'media').get };
    var bootstrapProfile = null;
    var reloadOnProfileChangeRequestIds = new Set();
    var installedSurfaceOwnership = { profileProtection: true, userAgent: true };
    function syncUserAgentDataDescriptor() {}
    var cachedUserAgentData = null, cachedLanguages = null, hasResolvedProfile = true, restoredPageNeedsReload = false;
    var initialEnabled = true, initialGlobalPrivacyControlEnabled, initialUserAgentSpoofingEnabled = true;
    var initialCanvasMeasureTextSpoofingEnabled, initialWebglInfoSpoofingEnabled, initialSiteKey, initialSeed;
    var initialProfileSignature;
    var location = { reload() { throw new Error('Unexpected reload'); } };
  `, context);
  vm.runInContext(nativeWrapperCode + code, context);
  vm.runInContext("initialProfileSignature = profileSignature(profile); patchFunctionToString(); patchScreen(window);", context);
  return { context, run: (text) => vm.runInContext(text, context) };
}

test("patchScreen masks prototype getters, preserves branding and native unrelated surfaces", () => {
  const h = harness();
  assert.equal(h.run("screen.width"), derive().width);
  assert.equal(h.run("screen.availHeight"), derive().availHeight);
  assert.equal(h.run("screen.availLeft"), 0);
  assert.equal(h.run("screen.isExtended"), false);
  assert.equal(h.run("screen.colorDepth"), 24);
  assert.equal(h.run("devicePixelRatio"), 2);
  assert.equal(h.run("Object.hasOwn(screen, 'width')"), false);
  assert.equal(h.run("var getter = Object.getOwnPropertyDescriptor(Screen.prototype, 'width').get; getter.toString() === originals.width.get.toString()"), true);
  assert.equal(h.run("getter.name === originals.width.get.name && getter.length === originals.width.get.length"), true);
  assert.equal(h.run("Object.getOwnPropertyDescriptor(Screen.prototype, 'width').enumerable"), true);
  assert.throws(() => h.run("getter.call({})"), { name: "TypeError" });
  h.run("state.enabled = false");
  assert.equal(h.run("screen.width"), 5000);
  assert.equal(h.run("screen.isExtended"), true);
});

test("patchScreen holds dimensions through resize and seed/site updates, refreshing on applyResolvedProfile profile changes only", () => {
  const h = harness();
  const initial = h.run("screen.width");
  h.run("outerWidth = 4001; outerHeight = 2201");
  assert.equal(h.run("screen.width"), initial);
  h.run("applyResolvedProfile({ ...state, seed: 'new-session', siteKey: 'other.example' }, 1)");
  assert.equal(h.run("screen.width"), initial);
  h.run("applyResolvedProfile({ ...state, profile: { ...state.profile, platformVersion: '13' } }, 2)");
  assert.equal(h.run("screen.width"), 4080);
  assert.equal(h.run("screen.height"), 2320);
  assert.equal(h.run("screen.height - screen.availHeight"), 48);
});

test("patchScreen leaves dimensions native for delegated, native-UA and non-Windows profiles but still hides multiple screens", () => {
  for (const setup of ["state.uaSpoofingEnabled = false", "state.profile = { ...state.profile, uaMode: 'native' }", "navigator.platform = 'Linux x86_64'", "navigator.platform = 'MacIntel'"]) {
    const h = harness();
    h.run(`${setup}; refreshScreenProfile()`);
    assert.equal(h.run("screen.width"), 5000, setup);
    assert.equal(h.run("screen.isExtended"), false, setup);
    assert.equal(h.run("matchMedia('(device-width: 5000px)').media"), "(device-width: 5000px)");
  }
});

test("patchScreen rewrites true/false media checks, preserves original media text and untouched queries", () => {
  const h = harness();
  const width = h.run("screen.width");
  assert.equal(h.run(`var query = 'screen and (device-width: ${width}px)'; var result = matchMedia(query); result.matches`), true);
  assert.equal(h.run("result.media === query"), true);
  assert.equal(h.run("originals.media.call(result)"), `screen and ${yes}`);
  assert.equal(h.run("matchMedia('(device-width: 1px)').matches"), false);
  assert.equal(h.run("matchMedia('(device-width: 1px)').media"), "(device-width: 1px)");
  assert.equal(h.run("matchMedia('(width: 100px)').media"), "(width: 100px)");
  assert.equal(h.run("matchMedia.toString() === originals.matchMedia.toString()"), true);
  assert.throws(() => h.run("Object.getOwnPropertyDescriptor(MediaQueryList.prototype, 'media').get.call({})"), { name: "TypeError" });
  h.run("state.enabled = false");
  assert.equal(h.run("originals.media.call(matchMedia('(device-width: 1px)'))"), "(device-width: 1px)");
});

test("patchScreen mirrors a related parent's public screen rather than its fallback profile", () => {
  const h = harness();
  h.run("state.uaSpoofingEnabled = false; parentIdentity = { screen: () => ({width: 1440, height: 900, availWidth: 1440, availHeight: 852, availLeft: 0, availTop: 0}) }");
  assert.equal(h.run("screen.width"), 1440);
  assert.equal(h.run("screen.availHeight"), 852);
  assert.equal(h.run("matchMedia('(device-width: 1440px)').matches"), true);
  h.run("parentIdentity.screen = () => null");
  assert.equal(h.run("screen.width"), 5000);
});

test("patchScreen installs in direct child realms and mirrors the parent's screen, including later profile changes", () => {
  const parent = harness();
  const child = harness();
  parent.context.child = child.run("globalThis");
  parent.run("patchScreen(child)");
  assert.equal(child.run("screen.width"), parent.run("screen.width"));
  parent.run("outerWidth = 4001; refreshScreenProfile()");
  assert.equal(child.run("screen.width"), 4080);
  assert.equal(child.run("matchMedia('(device-width: 4080px)').matches"), true);
});
