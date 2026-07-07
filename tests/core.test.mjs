import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  LOCALE_PRESETS,
  applyLocalePreset,
  PRESET_PROFILES,
  SUPPORTED_TIMEZONES,
  canvasFontHasBlockedFamily,
  dateFromZonedLocalParts,
  getTimezoneOffsetMinutes,
  headerRulesAllowed,
  isSupportedPageUrl,
  loadSettings,
  normalizeSettings,
  normalizeTimezoneId,
  profilesFromSettings,
  profileAllowsCjkFonts,
  resolveProfile,
  sanitizeCanvasFont,
  saveSettings,
  siteKeyFromHostname,
  siteKeyFromUrl,
  stableProfileIdForSite,
  stableSeed,
  updateSettings,
  userAgentForProfile
} from "../dist/lite/test-api.js";

test("site keys are stable and handle common second-level suffixes", () => {
  assert.equal(siteKeyFromUrl("https://shop.example.co.uk/path"), "example.co.uk");
  assert.equal(siteKeyFromHostname("a.b.example.com"), "example.com");
  assert.equal(siteKeyFromHostname("localhost"), "localhost");
});

test("internal browser pages are unsupported", () => {
  assert.equal(isSupportedPageUrl("https://example.com"), true);
  assert.equal(isSupportedPageUrl("file:///tmp/example.html"), true);
  assert.equal(isSupportedPageUrl("chrome-extension://abc/page.html"), false);
  assert.equal(isSupportedPageUrl("helium://settings"), false);
  assert.equal(isSupportedPageUrl("chrome://extensions"), false);
});

test("profile selection is deterministic and isolated by site", () => {
  const first = stableProfileIdForSite("example.com", PRESET_PROFILES);
  const second = stableProfileIdForSite("example.com", PRESET_PROFILES);
  assert.equal(first, second);
  assert.notEqual(stableSeed("example.com", first), stableSeed("other.test", first));
});

test("timezone offsets include DST rules", () => {
  assert.equal(getTimezoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/Los_Angeles"), 480);
  assert.equal(getTimezoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/Los_Angeles"), 420);
  assert.equal(getTimezoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/Berlin"), -60);
  assert.equal(getTimezoneOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/Berlin"), -120);
});

test("numeric date construction can target a spoofed timezone", () => {
  const date = dateFromZonedLocalParts("America/Los_Angeles", 2026, 6, 3, 12, 30, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  assert.equal(values.year, "2026");
  assert.equal(values.month, "07");
  assert.equal(values.day, "03");
  assert.equal(values.hour, "12");
  assert.equal(values.minute, "30");
});

test("profile user-agent keeps the native Chromium major", () => {
  const ua = userAgentForProfile(PRESET_PROFILES[0], "Mozilla/5.0 Chrome/150.0.7871.46 Safari/537.36");
  assert.match(ua, /Chrome\/150\.0\.0\.0/);
});

test("profiles expose an allow-listed font set instead of enumerating blocked fonts", () => {
  const losAngeles = PRESET_PROFILES.find((profile) => profile.id === "los-angeles-en-us");
  const beijing = PRESET_PROFILES.find((profile) => profile.id === "beijing-zh-cn");
  const tokyo = PRESET_PROFILES.find((profile) => profile.id === "tokyo-ja-jp");
  assert.ok(losAngeles);
  assert.ok(beijing);
  assert.ok(tokyo);
  assert.equal(profileAllowsCjkFonts(losAngeles), false);
  assert.equal(profileAllowsCjkFonts(beijing), true);
  assert.equal(canvasFontHasBlockedFamily("16px 'Microsoft YaHei', sans-serif", losAngeles), true);
  assert.equal(canvasFontHasBlockedFamily("16px 'Microsoft YaHei', sans-serif", beijing), false);
  assert.equal(canvasFontHasBlockedFamily("16px 'Microsoft YaHei', sans-serif", tokyo), true);
  assert.equal(canvasFontHasBlockedFamily("16px Meiryo, sans-serif", tokyo), false);
  assert.equal(canvasFontHasBlockedFamily("16px '方正小标宋简体', monospace", losAngeles), true);
  assert.equal(canvasFontHasBlockedFamily("16px '仿宋_GB2312', monospace", losAngeles), true);
  assert.equal(canvasFontHasBlockedFamily("16px 'Some Arbitrary Probe Font', monospace", losAngeles), true);
  assert.equal(sanitizeCanvasFont("16px 'Microsoft YaHei', monospace", losAngeles), "16px monospace");
  assert.equal(sanitizeCanvasFont("16px '方正小标宋简体', monospace", losAngeles), "16px monospace");
  assert.equal(sanitizeCanvasFont("16px 'Some Arbitrary Probe Font', Arial, sans-serif", losAngeles), "16px Arial, sans-serif");
});

test("resolveProfile respects global disable and exclusions", () => {
  const disabled = normalizeSettings({ ...DEFAULT_SETTINGS, enabled: false });
  assert.equal(resolveProfile("https://example.com", disabled, "lite").enabled, false);
  assert.equal(resolveProfile("https://example.com", disabled, "lite").reason, "global-disabled");

  const excluded = normalizeSettings({ ...DEFAULT_SETTINGS, excludedDomains: ["example.com"] });
  assert.equal(resolveProfile("https://sub.example.com", excluded, "lite").enabled, false);
  assert.equal(resolveProfile("https://sub.example.com", excluded, "lite").reason, "excluded-domain");
});

test("settings migration keeps profile visibility explicit", () => {
  const legacy = normalizeSettings({
    enabled: true,
    advancedEnabled: true,
    siteProfiles: {},
    siteNonces: {},
    excludedDomains: [],
    temporaryDisabledUntil: null,
    customProfiles: []
  });
  assert.deepEqual(legacy.hiddenPresetProfileIds, []);

  const hidden = normalizeSettings({
    ...DEFAULT_SETTINGS,
    hiddenPresetProfileIds: ["los-angeles-en-us"],
    siteProfiles: {
      "hidden.example": "los-angeles-en-us",
      "valid.example": "tokyo-ja-jp"
    }
  });
  assert.equal(profilesFromSettings(hidden).some((profile) => profile.id === "los-angeles-en-us"), false);
  assert.equal(
    hidden.siteProfiles["hidden.example"],
    stableProfileIdForSite("hidden.example", profilesFromSettings(hidden))
  );
  assert.equal(hidden.siteProfiles["valid.example"], "tokyo-ja-jp");

  const missingCustom = normalizeSettings({
    ...DEFAULT_SETTINGS,
    siteProfiles: {
      "custom.example": "deleted-custom"
    },
    siteNonces: {
      "custom.example": 3
    }
  });
  assert.equal(
    missingCustom.siteProfiles["custom.example"],
    stableProfileIdForSite("custom.example", profilesFromSettings(missingCustom), 3)
  );
});

test("settings migration keeps custom timezones IANA-only", () => {
  const custom = {
    ...PRESET_PROFILES[0],
    id: "custom-invalid-timezone",
    timezoneId: "UTC"
  };
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    customProfiles: [custom]
  });
  assert.equal(settings.customProfiles[0].timezoneId, "America/Los_Angeles");
});

test("timezone aliases normalize to browser-supported IDs", () => {
  assert.equal(normalizeTimezoneId("Asia/Ho_Chi_Minh"), "Asia/Saigon");
  assert.equal(normalizeTimezoneId("Asia/Kolkata"), "Asia/Calcutta");
  assert.ok(SUPPORTED_TIMEZONES.includes("Asia/Saigon"));
  assert.ok(SUPPORTED_TIMEZONES.includes("Asia/Calcutta"));
});

test("locale presets fill language and location fields", () => {
  assert.ok(LOCALE_PRESETS.length >= 20);
  const profile = applyLocalePreset(PRESET_PROFILES[0], "zh-CN");
  assert.equal(profile.locale, "zh-CN");
  assert.equal(profile.intlLocale, "zh-CN");
  assert.deepEqual(profile.languages, ["zh-CN", "zh", "en-US", "en"]);
  assert.equal(profile.acceptLanguage, "zh-CN,zh;q=0.9,en-US;q=0.7,en;q=0.6");
  assert.equal(profile.timezoneId, "Asia/Shanghai");
  assert.equal(profile.latitude, 39.9042);
  assert.equal(profile.longitude, 116.4074);

  const vietnam = applyLocalePreset(PRESET_PROFILES[0], "vi-VN");
  assert.equal(vietnam.timezoneId, "Asia/Saigon");
  assert.equal(vietnam.latitude, 10.8231);
  assert.equal(vietnam.longitude, 106.6297);

  const india = applyLocalePreset(PRESET_PROFILES[0], "en-IN");
  assert.equal(india.timezoneId, "Asia/Calcutta");
  assert.equal(india.latitude, 19.076);
  assert.equal(india.longitude, 72.8777);
});

test("header rules honor temporary disable windows", () => {
  const now = Date.UTC(2026, 6, 3);
  assert.equal(headerRulesAllowed(normalizeSettings({
    ...DEFAULT_SETTINGS,
    temporaryDisabledUntil: now + 60_000
  }), now), false);
  assert.equal(headerRulesAllowed(normalizeSettings({
    ...DEFAULT_SETTINGS,
    temporaryDisabledUntil: now - 60_000
  }), now), true);
});

test("settings writes are serialized", async () => {
  const storage = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return { [key]: storage[key] };
        },
        async set(value) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          Object.assign(storage, value);
        }
      }
    }
  };

  await saveSettings(DEFAULT_SETTINGS);
  await Promise.all([
    updateSettings((settings) => {
      settings.siteProfiles["a.example"] = "los-angeles-en-us";
    }),
    updateSettings((settings) => {
      settings.siteProfiles["b.example"] = "tokyo-ja-jp";
    })
  ]);

  const settings = await loadSettings();
  assert.equal(settings.siteProfiles["a.example"], "los-angeles-en-us");
  assert.equal(settings.siteProfiles["b.example"], "tokyo-ja-jp");
});
