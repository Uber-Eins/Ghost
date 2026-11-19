import test from "node:test";
import assert from "node:assert/strict";
import {
  PRESET_PROFILES, DEFAULT_SETTINGS, normalizeSettings, resolveProfile, cloneProfile,
  screenForProfile, SCREEN_RESOLUTIONS, automaticScreenPanel, fnv1a,
  keyboardLayoutForProfile, voicesForProfile, WINDOWS_VOICE_LOCALES
} from "../dist/test/test-api.js";

const profile = PRESET_PROFILES[0];
const normalized = (changes = {}) => normalizeSettings({ customProfiles: [{ ...profile, id: "custom-surfaces", ...changes }] }).customProfiles[0];
const screen = (changes = {}, dpr = 1, outer = { width: 0, height: 0 }) => screenForProfile({ ...profile, ...changes }, "Win32", outer, dpr);

test("normalizeSettings defaults legacy profile surfaces and global flags to automatic/enabled", () => {
  const settings = normalizeSettings({ customProfiles: [{ ...profile, id: "legacy" }] });
  assert.equal(settings.mediaDeviceListEnabled, true);
  assert.equal(settings.singleScreenEnabled, true);
  assert.equal(settings.customProfiles[0].screenResolution, "auto");
  assert.equal(settings.customProfiles[0].keyboardLayout, "auto");
  assert.equal(settings.customProfiles[0].voices, "auto");
  assert.equal(DEFAULT_SETTINGS.mediaDeviceListEnabled, true);
  assert.equal(DEFAULT_SETTINGS.singleScreenEnabled, true);
  for (const value of [null, 0, "false", {}, []]) {
    const invalid = normalizeSettings({ mediaDeviceListEnabled: value, singleScreenEnabled: value });
    assert.equal(invalid.mediaDeviceListEnabled, true);
    assert.equal(invalid.singleScreenEnabled, true);
  }
});

test("normalizeSettings validates physical panel bounds and integral dimensions", () => {
  for (const value of [{ width: 640, height: 480 }, { width: 7680, height: 4320 }, { width: 1920, height: 1080 }]) {
    assert.deepEqual(normalized({ screenResolution: value }).screenResolution, value);
  }
  for (const value of [undefined, null, "auto", "1920x1080", {}, [1920, 1080],
    { width: 639, height: 480 }, { width: 7681, height: 1080 }, { width: 1920, height: 479 },
    { width: 1920, height: 4321 }, { width: 1920.5, height: 1080 }, { width: "1920", height: 1080 },
    { width: Infinity, height: 1080 }, { width: 1920, height: NaN }]) {
    assert.equal(normalized({ screenResolution: value }).screenResolution, "auto");
  }
});

test("normalizeSettings validates layouts and canonicalizes ordered voice packs without aliases", () => {
  for (const value of ["auto", "us", "uk", "de", "fr", "jp"]) assert.equal(normalized({ keyboardLayout: value }).keyboardLayout, value);
  for (const value of [null, "DE", "unknown", {}, []]) assert.equal(normalized({ keyboardLayout: value }).keyboardLayout, "auto");
  assert.deepEqual(normalized({ voices: ["JA-jp", "en-us", "ja-JP", "unknown", "en-SG", null, " EN-gb "] }).voices, ["ja-JP", "en-US", "en-GB"]);
  assert.deepEqual(normalized({ voices: WINDOWS_VOICE_LOCALES }).voices, WINDOWS_VOICE_LOCALES);
  for (const value of [[], ["unknown"], [null]]) assert.equal(normalized({ voices: value }).voices, "none");
  assert.equal(normalized({ voices: "none" }).voices, "none");
  for (const value of [undefined, null, "invalid", {}, 0]) assert.equal(normalized({ voices: value }).voices, "auto");
});

test("cloneProfile copies mutable screen and voice settings", () => {
  const original = normalized({ screenResolution: { width: 1920, height: 1080 }, voices: ["en-US"] });
  const copy = cloneProfile(original);
  copy.screenResolution.width = 2560;
  copy.voices.push("ja-JP");
  assert.equal(original.screenResolution.width, 1920);
  assert.deepEqual(original.voices, ["en-US"]);
});

test("screenForProfile selects physical panels by stable id after the DPR minimum filter", () => {
  for (const dpr of [1, 2]) {
    const candidates = SCREEN_RESOLUTIONS.filter(([width, height]) => Math.round(width / dpr) >= 1280 && Math.round(height / dpr) >= 720);
    for (const preset of PRESET_PROFILES) {
      const panel = candidates[fnv1a(preset.id) % candidates.length];
      assert.deepEqual(automaticScreenPanel(preset, dpr), panel);
      const actual = screenForProfile(preset, "Win32", { width: 0, height: 0 }, dpr);
      assert.deepEqual([actual.width, actual.height], panel.map((size) => Math.round(size / dpr)));
      assert.equal(actual.height - actual.availHeight, 40);
    }
  }
});

test("screenForProfile bumps auto among filtered CSS candidates and rounds beyond them at DPR 1 and 2", () => {
  for (const dpr of [1, 2]) {
    const initial = screen({}, dpr);
    const outer = { width: initial.width + 1, height: initial.availHeight };
    const fitting = SCREEN_RESOLUTIONS
      .map(([width, height]) => [Math.round(width / dpr), Math.round(height / dpr)])
      .filter(([width, height]) => width >= 1280 && height >= 720)
      .find(([width, height]) => width >= outer.width && height - 40 >= outer.height);
    const actual = screen({}, dpr, outer);
    assert.deepEqual([actual.width, actual.height], fitting ?? [Math.ceil(outer.width / 80) * 80, Math.ceil((outer.height + 40) / 80) * 80]);
    const huge = screen({}, dpr, { width: 4001, height: 2201 });
    assert.deepEqual([huge.width, huge.height], [4080, 2320]);
  }
});

test("screenForProfile fixed mode divides and rounds physical pixels without a fit bump", () => {
  for (const dpr of [1, 2]) {
    const actual = screen({ screenResolution: { width: 1367, height: 769 }, platformVersion: "13" }, dpr, { width: 5000, height: 3000 });
    assert.equal(actual.width, Math.round(1367 / dpr));
    assert.equal(actual.height, Math.round(769 / dpr));
    assert.equal(actual.height - actual.availHeight, 48);
  }
});

test("screenForProfile keeps the largest real panel at DPR 4 until the window requires rounding", () => {
  assert.deepEqual(automaticScreenPanel(profile, 4), [3840, 2160]);
  assert.deepEqual([screen({}, 4).width, screen({}, 4).height], [960, 540]);
  const bumped = screen({}, 4, { width: 1000, height: 600 });
  assert.deepEqual([bumped.width, bumped.height], [1040, 640]);
});

test("keyboardLayoutForProfile explicit layout overrides the locale", () => {
  for (const [setting, locale] of [["us", "en-US"], ["uk", "en-GB"], ["de", "de-DE"], ["fr", "fr-FR"], ["jp", "ja-JP"]]) {
    assert.deepEqual(keyboardLayoutForProfile({ locale: "zh-CN", keyboardLayout: setting }), keyboardLayoutForProfile({ locale }));
  }
  assert.deepEqual(keyboardLayoutForProfile({ locale: "de-DE", keyboardLayout: "auto" }), keyboardLayoutForProfile({ locale: "de-DE" }));
});

test("voicesForProfile respects none/explicit/auto and retains platform gating and registry order", () => {
  assert.deepEqual(voicesForProfile({ ...profile, voices: "none" }, "Win32"), []);
  assert.deepEqual(voicesForProfile({ ...profile, voices: "auto" }, "Win32"), voicesForProfile(profile, "Win32"));
  const explicit = voicesForProfile({ ...profile, locale: "xx-ZZ", voices: ["ja-JP", "en-US"] }, "Win32");
  assert.equal(explicit[0].name, "Microsoft Ayumi - Japanese (Japan)");
  assert.equal(explicit[0].default, true);
  assert.equal(explicit.filter((voice) => voice.default).length, 1);
  assert.deepEqual(new Set(explicit.map((voice) => voice.lang)), new Set(["ja-JP", "en-US"]));
  assert.deepEqual(explicit.slice(1).map((voice) => voice.lang), ["en-US", "en-US", "en-US", "ja-JP", "ja-JP", "ja-JP"]);
  assert.equal(voicesForProfile({ ...profile, voices: ["en-US", "ja-JP"] }, "Win32")[0].lang, "en-US");
  for (const platform of ["MacIntel", "Linux x86_64"]) assert.deepEqual(voicesForProfile({ ...profile, voices: ["en-US"] }, platform), []);
});

test("resolveProfile carries global media and single-screen flags gated by protection", () => {
  for (const mediaDeviceListEnabled of [true, false]) {
    for (const singleScreenEnabled of [true, false]) {
      const settings = normalizeSettings({ mediaDeviceListEnabled, singleScreenEnabled });
      const resolved = resolveProfile("https://example.test", settings, "lite");
      assert.equal(resolved.mediaDeviceListEnabled, mediaDeviceListEnabled);
      assert.equal(resolved.singleScreenEnabled, singleScreenEnabled);
      const disabled = resolveProfile("https://example.test", { ...settings, enabled: false }, "advanced");
      assert.equal(disabled.mediaDeviceListEnabled, false);
      assert.equal(disabled.singleScreenEnabled, false);
    }
  }
});
