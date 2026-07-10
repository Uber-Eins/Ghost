import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  DEFAULT_EXCLUDED_DOMAINS,
  DEFAULT_SETTINGS,
  FILE_SITE_RULE,
  DEFAULT_SITE_RULE,
  LOCALE_PRESETS,
  applyLocalePreset,
  appVersionForProfile,
  PRESET_PROFILES,
  SUPPORTED_TIMEZONES,
  canvasFontHasBlockedFamily,
  dateFromZonedLocalParts,
  exclusionAppliesToSiteKey,
  exclusionsForSiteToggle,
  getTimezoneOffsetMinutes,
  headerRulesAllowed,
  isAccessiblePageUrl,
  isSupportedPageUrl,
  senderBoundPageUrl,
  loadSettings,
  normalizeExclusionRule,
  normalizeSettings,
  normalizeSiteRuleKey,
  normalizeTimezoneId,
  navigatorPlatformForProfile,
  navigatorVendorForProfile,
  profilesFromSettings,
  profileAllowsCjkFonts,
  requestFilePathStartRegexFilter,
  requestHostPathStartRegexFilter,
  requestPathStartRegexFilter,
  repairContentBootstrap,
  resolveProfile,
  sanitizeCanvasFont,
  isExcludedUrl,
  saveSettings,
  siteKeyFromHostname,
  siteKeyFromUrl,
  stableProfileIdForSite,
  stableSeed,
  updateSettings,
  userAgentForProfile,
  userAgentMetadataForProfile,
  urlMatchesHostPathRule
} from "../dist/test/test-api.js";

const dnrChrome = {
  declarativeNetRequest: {
    ResourceType: {
      MAIN_FRAME: "main_frame",
      SUB_FRAME: "sub_frame",
      STYLESHEET: "stylesheet",
      SCRIPT: "script",
      IMAGE: "image",
      FONT: "font",
      OBJECT: "object",
      XMLHTTPREQUEST: "xmlhttprequest",
      PING: "ping",
      CSP_REPORT: "csp_report",
      MEDIA: "media",
      WEBSOCKET: "websocket",
      WEBTRANSPORT: "webtransport",
      WEBBUNDLE: "webbundle",
      OTHER: "other"
    },
    RuleActionType: {
      MODIFY_HEADERS: "modifyHeaders",
      ALLOW: "allow",
      ALLOW_ALL_REQUESTS: "allowAllRequests"
    },
    HeaderOperation: {
      SET: "set",
      REMOVE: "remove"
    },
    async isRegexSupported() {
      return { isSupported: true };
    }
  }
};
const originalChrome = globalThis.chrome;
globalThis.chrome = dnrChrome;
const { buildHeaderRulesForTesting, buildTabHeaderRulesForTesting } = await import("../dist/test/dnr-test-api.js");
globalThis.chrome = originalChrome;

test("site keys preserve full host names", () => {
  assert.equal(siteKeyFromUrl("https://shop.example.co.uk/path"), "shop.example.co.uk");
  assert.equal(siteKeyFromHostname("a.b.example.com"), "a.b.example.com");
  assert.equal(siteKeyFromUrl("http://[::1]:3000/path"), "[::1]");
  assert.equal(siteKeyFromUrl("file:///tmp/example.html"), FILE_SITE_RULE);
  assert.equal(siteKeyFromHostname("localhost"), "localhost");
});

test("site rules use host suffix matching with a wildcard default", () => {
  assert.equal(normalizeSettings({}).siteProfiles[DEFAULT_SITE_RULE], PRESET_PROFILES[0].id);
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    siteProfiles: {
      [DEFAULT_SITE_RULE]: "los-angeles-en-us",
      "google.com": "tokyo-ja-jp",
      "accounts.google.com": "beijing-zh-cn"
    }
  });
  assert.equal(settings.siteProfiles[DEFAULT_SITE_RULE], "los-angeles-en-us");
  assert.equal(resolveProfile("https://www.google.com/search", settings, "lite").profile.id, "tokyo-ja-jp");
  assert.equal(resolveProfile("https://a.b.c.google.com/search", settings, "lite").profile.id, "tokyo-ja-jp");
  assert.equal(resolveProfile("https://accounts.google.com/signin", settings, "lite").profile.id, "beijing-zh-cn");
  assert.equal(resolveProfile("https://example.com", settings, "lite").profile.id, "los-angeles-en-us");
  assert.equal(resolveProfile("https://other.test", settings, "lite").profile.id, "los-angeles-en-us");
  assert.notEqual(resolveProfile("https://example.com", settings, "lite").seed, resolveProfile("https://other.test", settings, "lite").seed);
  const wwwGoogle = resolveProfile("https://www.google.com/search", settings, "lite");
  const mailGoogle = resolveProfile("https://mail.google.com/mail", settings, "lite");
  assert.equal(wwwGoogle.profile.id, mailGoogle.profile.id);
  assert.notEqual(wwwGoogle.seed, mailGoogle.seed);
  const siteRuleKeys = Object.keys(settings.siteProfiles);
  resolveProfile("https://new.example.test", settings, "lite");
  assert.deepEqual(Object.keys(settings.siteProfiles), siteRuleKeys);
});

test("default exclusions include captcha and account challenge routes", () => {
  const settings = normalizeSettings({});
  for (const domain of DEFAULT_EXCLUDED_DOMAINS) {
    assert.ok(settings.excludedDomains.includes(domain));
  }
  assert.equal(isExcludedUrl("https://www.google.com/recaptcha/api.js", settings.excludedDomains), true);
  assert.equal(isExcludedUrl("https://www.gstatic.com/recaptcha/releases/x/recaptcha__en.js", settings.excludedDomains), true);
  assert.equal(isExcludedUrl("https://accounts.google.com/signin", settings.excludedDomains), true);
  assert.equal(isExcludedUrl("https://accounts.youtube.com/accounts/SetSID", settings.excludedDomains), true);
  assert.equal(isExcludedUrl("https://gitlab.com/users/sign_in", settings.excludedDomains), true);
  assert.equal(isExcludedUrl("https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b", settings.excludedDomains), true);
  assert.equal(isExcludedUrl("https://www.google.com/search?q=recaptcha", settings.excludedDomains), false);
  assert.equal(isExcludedUrl("https://accounts.google.com/signin", ["google.com/recaptcha"]), false);
  assert.equal(isExcludedUrl("https://example.com/%E7%99%BB%E5%BD%95", ["example.com/登录"]), true);
  assert.equal(isExcludedUrl("https://example.com/a%20b", ["example.com/a b"]), true);
});

test("DNR path exclusion filters anchor paths after the request host", () => {
  const filter = new RegExp(requestPathStartRegexFilter("/login"));
  assert.equal(filter.test("https://example.com/login"), true);
  assert.equal(filter.test("ws://example.com/login"), true);
  assert.equal(filter.test("wss://example.com/login"), true);
  assert.equal(filter.test("https://example.com/login/callback"), true);
  assert.equal(filter.test("https://example.com/page/login"), false);
  assert.equal(filter.test("https://example.com/page?next=/login"), false);
  const queryFilter = requestPathStartRegexFilter("/login?next=a%20b");
  assert.equal(queryFilter.includes("%2520"), false);
  assert.equal(new RegExp(queryFilter).test("https://example.com/login?next=a%20b"), true);
  assert.equal(new RegExp(requestPathStartRegexFilter("/login?next=%2Fdashboard")).test("https://example.com/login?next=%2Fdashboard"), true);
  assert.equal(new RegExp(requestPathStartRegexFilter("/a b")).test("https://example.com/a%20b"), true);
  assert.equal(new RegExp(requestPathStartRegexFilter("/登录")).test("https://example.com/%E7%99%BB%E5%BD%95"), true);
  assert.equal(new RegExp(requestFilePathStartRegexFilter(null)).test("file:///tmp/example.html"), true);
  assert.equal(new RegExp(requestFilePathStartRegexFilter("/tmp/a b")).test("file:///tmp/a%20b"), true);
  assert.equal(new RegExp(requestHostPathStartRegexFilter("example.com", null)).test("https://example.com/path"), true);
  assert.equal(new RegExp(requestHostPathStartRegexFilter("example.com", null)).test("ws://example.com/path"), true);
  assert.equal(new RegExp(requestHostPathStartRegexFilter("example.com", null)).test("wss://example.com/path"), true);
  assert.equal(new RegExp(requestHostPathStartRegexFilter("example.com", null)).test("https://example.com.evil/path"), false);
  assert.equal(new RegExp(requestHostPathStartRegexFilter("[::1]", null)).test("http://[::1]:3000/path"), true);
  assert.equal(new RegExp(requestHostPathStartRegexFilter("[::1]", null)).test("http://[::10]:3000/path"), false);
});

test("host rules are canonicalized or rejected before storage", () => {
  assert.equal(normalizeSiteRuleKey("*.example.com"), "example.com");
  assert.equal(normalizeSiteRuleKey("[::1]"), "[::1]");
  assert.equal(normalizeSiteRuleKey("file:///tmp/example.html"), FILE_SITE_RULE);
  assert.equal(normalizeSiteRuleKey("https://example.com?debug=1"), "example.com");
  assert.equal(normalizeExclusionRule("https://example.com?debug=1"), "example.com/?debug=1");
  assert.equal(normalizeExclusionRule("*.example.com/login"), "example.com/login");
  assert.equal(normalizeExclusionRule("example.com/a b"), "example.com/a%20b");
  assert.equal(normalizeExclusionRule("example.com/登录"), "example.com/%E7%99%BB%E5%BD%95");
  assert.equal(normalizeExclusionRule("example.com/a%b"), "example.com/a%25b");
  assert.equal(normalizeSiteRuleKey("foo_bar.example.com"), "");
  assert.equal(normalizeExclusionRule("https://example.com:bad/login"), "");

  const encodedRules = [
    "example.com/a%25b",
    "example.com/a%252Fb",
    "example.com/a/%252e%252e/private"
  ];
  for (const rule of encodedRules) {
    const normalized = normalizeExclusionRule(rule);
    assert.equal(normalized, rule);
    assert.equal(normalizeExclusionRule(normalized), normalized);
    assert.equal(urlMatchesHostPathRule(`https://${rule}`, normalized), true);
  }
  const encodedSlashRule = normalizeExclusionRule("example.com/a%252Fb");
  assert.equal(urlMatchesHostPathRule("https://example.com/a%2Fb", encodedSlashRule), false);
  assert.equal(normalizeExclusionRule("example.com/a%2fb"), "example.com/a%2Fb");
  assert.equal(urlMatchesHostPathRule("https://example.com/a%2fb", "example.com/a%2Fb"), true);
  assert.equal(normalizeExclusionRule("example.com/a/%2e%2e/private"), "example.com/private");
  assert.equal(urlMatchesHostPathRule("https://example.com/private", "example.com/a/%2e%2e/private"), true);
  assert.equal(urlMatchesHostPathRule("https://example.com/private", "example.com/a/%252e%252e/private"), false);
  const fileRule = normalizeExclusionRule("file:///tmp/a%252Fb");
  assert.equal(fileRule, "file:///tmp/a%252Fb");
  assert.equal(normalizeExclusionRule(fileRule), fileRule);
  assert.equal(urlMatchesHostPathRule("file:///tmp/a%252Fb", fileRule), true);
  assert.equal(urlMatchesHostPathRule("file:///tmp/a%2Fb", fileRule), false);

  const escapedRegexPath = `example.com/path?q=${"[]".repeat(700)}`;
  assert.equal(normalizeExclusionRule(escapedRegexPath), "");
  assert.equal(normalizeExclusionRule(`example.com/${"a".repeat(2048)}`), "");

  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    excludedDefaultsVersion: 1,
    excludedDomains: ["*.example.com/login", "foo_bar.example.com"],
    siteProfiles: {
      "*.example.com": "los-angeles-en-us",
      "foo_bar.example.com": "tokyo-ja-jp"
    }
  });
  assert.equal(settings.siteProfiles["example.com"], "los-angeles-en-us");
  assert.equal(settings.siteProfiles["foo_bar.example.com"], undefined);
  assert.deepEqual(settings.excludedDomains, ["example.com/login"]);
});

test("site enable clears inherited host, path, and wildcard exclusions", () => {
  assert.equal(exclusionAppliesToSiteKey("example.com", "sub.example.com"), true);
  assert.equal(exclusionAppliesToSiteKey("gitlab.com/users/sign_in", "gitlab.com"), true);
  assert.equal(exclusionAppliesToSiteKey("*", "example.com"), true);
  assert.equal(exclusionAppliesToSiteKey("sub.example.com", "example.com"), false);
  assert.equal(urlMatchesHostPathRule("https://accounts.google.com/signin", "google.com/recaptcha"), false);
  assert.equal(urlMatchesHostPathRule("https://gitlab.com/users/sign_in", "gitlab.com/users/sign_in"), true);
  assert.equal(urlMatchesHostPathRule("https://sub.example.com/page", "example.com"), true);
  assert.equal(urlMatchesHostPathRule("https://example.com/page", "*"), true);
  assert.equal(urlMatchesHostPathRule("http://[::1]:3000/path", "[::1]"), true);
  assert.equal(urlMatchesHostPathRule("file:///tmp/example.html", "file://"), true);
  assert.deepEqual(
    exclusionsForSiteToggle(["*", "example.com/login", "other.test"], "example.com", "https://example.com/login", true),
    ["other.test"]
  );
  assert.deepEqual(
    exclusionsForSiteToggle(["other.test"], "sub.example.com", "https://sub.example.com/", false),
    ["other.test", "sub.example.com"]
  );
});

test("internal browser pages are unsupported", () => {
  assert.equal(isSupportedPageUrl("https://example.com"), true);
  assert.equal(isSupportedPageUrl("file:///tmp/example.html"), true);
  assert.equal(isSupportedPageUrl("chrome-extension://abc/page.html"), false);
  assert.equal(isSupportedPageUrl("helium://settings"), false);
  assert.equal(isSupportedPageUrl("chrome://extensions"), false);
  assert.equal(isAccessiblePageUrl("https://example.com", false), true);
  assert.equal(isAccessiblePageUrl("file:///tmp/example.html", true), true);
  assert.equal(isAccessiblePageUrl("file:///tmp/example.html", false), false);
});

test("profile resolution accepts same-origin SPA URLs without trusting cross-origin requests", () => {
  assert.equal(
    senderBoundPageUrl("https://example.com/private", "https://example.com/start"),
    "https://example.com/private"
  );
  assert.equal(
    senderBoundPageUrl("https://evil.test/", "https://example.com/start"),
    "https://example.com/start"
  );
  assert.equal(
    senderBoundPageUrl("https://example.com/frame", "about:blank", "https://example.com"),
    "https://example.com/frame"
  );
  assert.equal(
    senderBoundPageUrl("file:///tmp/other.html", "file:///tmp/start.html"),
    "file:///tmp/start.html"
  );
  assert.equal(
    senderBoundPageUrl("https://example.com/", "data:text/html,frame", "null", "https://example.com/top"),
    "https://example.com/"
  );
  assert.equal(senderBoundPageUrl("https://example.com/", "about:blank", "https://evil.test"), "");
});

test("bootstrap does not broadcast settings into the page", () => {
  const pageMain = readFileSync(new URL("../dist/lite/page-main.js", import.meta.url), "utf8");
  const bridge = readFileSync(new URL("../dist/lite/content-bridge.js", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../dist/lite/manifest.json", import.meta.url), "utf8"));
  assert.equal(existsSync(new URL("../dist/lite/content-fallback.js", import.meta.url)), false);
  assert.doesNotMatch(pageMain, /bootstrapAck|type:\s*["']bootstrap["']/);
  assert.doesNotMatch(bridge, /getContentBootstrap|payload:\s*bootstrap|request\.url/);
  assert.match(bridge, /type:\s*["']connected["']/);
  assert.equal(manifest.minimum_chrome_version, "120");
  assert.ok(manifest.permissions.includes("userScripts"));
  assert.ok(manifest.permissions.includes("declarativeNetRequestWithHostAccess"));
  assert.equal(manifest.permissions.includes("declarativeNetRequest"), false);
  assert.equal(manifest.permissions.includes("activeTab"), false);
  assert.equal(manifest.content_scripts[0].match_about_blank, true);
  assert.equal(manifest.content_scripts[0].match_origin_as_fallback, true);
  assert.equal("web_accessible_resources" in manifest, false);
  assert.equal(existsSync(new URL("../dist/lite/fingerprint.html", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/lite/test-api.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/lite/dnr-test-api.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/lite/advanced-test-api.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../dist/lite/page-related.js", import.meta.url)), true);

  const enMessages = JSON.parse(readFileSync(new URL("../dist/lite/_locales/en/messages.json", import.meta.url), "utf8"));
  const zhMessages = JSON.parse(readFileSync(new URL("../dist/lite/_locales/zh_CN/messages.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(zhMessages).sort(), Object.keys(enMessages).sort());
});

test("a fresh extension context repairs user-script registration after access is granted", async () => {
  const registeredContentScripts = new Map();
  const registeredUserScripts = new Map();
  const scripting = {
    async getRegisteredContentScripts({ ids }) {
      return ids.flatMap((id) => registeredContentScripts.has(id) ? [registeredContentScripts.get(id)] : []);
    },
    async registerContentScripts(scripts) {
      for (const script of scripts) registeredContentScripts.set(script.id, script);
    },
    async updateContentScripts(scripts) {
      for (const script of scripts) registeredContentScripts.set(script.id, script);
    },
    async unregisterContentScripts({ ids }) {
      for (const id of ids) registeredContentScripts.delete(id);
    }
  };
  const previousChrome = globalThis.chrome;
  try {
    globalThis.chrome = { scripting };
    assert.equal(await repairContentBootstrap(DEFAULT_SETTINGS, "lite"), false);
    assert.deepEqual(registeredContentScripts.get("ghost-page-main-fallback").js, ["page-main.js"]);

    globalThis.chrome = {
      scripting,
      userScripts: {
        async getScripts({ ids }) {
          return ids.flatMap((id) => registeredUserScripts.has(id) ? [registeredUserScripts.get(id)] : []);
        },
        async register(scripts) {
          for (const script of scripts) registeredUserScripts.set(script.id, script);
        },
        async update(scripts) {
          for (const script of scripts) registeredUserScripts.set(script.id, script);
        },
        async unregister({ ids }) {
          for (const id of ids) registeredUserScripts.delete(id);
        }
      }
    };
    assert.equal(await repairContentBootstrap(DEFAULT_SETTINGS, "lite"), true);
    const registered = registeredUserScripts.get("ghost-page-main");
    assert.ok(registered);
    assert.equal(registered.world, "MAIN");
    assert.equal(registered.runAt, "document_start");
    assert.equal(registered.js[1].file, "page-main.js");
    assert.deepEqual(registeredContentScripts.get("ghost-page-main-fallback").js, ["page-related.js"]);
  } finally {
    globalThis.chrome = previousChrome;
  }
});

test("DNR rules keep navigation and initiator profiles coherent", () => {
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    excludedDefaultsVersion: 1,
    excludedDomains: [],
    siteProfiles: {
      [DEFAULT_SITE_RULE]: "los-angeles-en-us",
      "example.com": "tokyo-ja-jp",
      intranet: "beijing-zh-cn"
    }
  });
  const rules = buildHeaderRulesForTesting(settings);
  const modifyRules = rules.filter((rule) => rule.action.type === "modifyHeaders");
  const headerNames = (rule) => new Set(rule.action.requestHeaders.map((header) => header.header.toLowerCase()));
  const exampleNavigation = modifyRules.find((rule) => (
    rule.condition.requestDomains?.includes("example.com")
    && rule.condition.resourceTypes?.includes("main_frame")
    && headerNames(rule).has("user-agent")
  ));
  const exampleSubresources = modifyRules.find((rule) => (
    rule.condition.initiatorDomains?.includes("example.com")
    && rule.condition.resourceTypes?.includes("script")
    && headerNames(rule).has("user-agent")
  ));
  assert.ok(exampleNavigation);
  assert.ok(exampleSubresources);
  assert.equal(exampleSubresources.condition.requestDomains, undefined);
  assert.ok(exampleSubresources.condition.resourceTypes.includes("webtransport"));
  assert.ok(exampleSubresources.condition.resourceTypes.includes("webbundle"));
  assert.ok(modifyRules.some((rule) => rule.condition.requestDomains?.includes("intranet")));
  assert.ok(modifyRules.some((rule) => rule.condition.initiatorDomains?.includes("intranet")));

  const clientHintRules = modifyRules.filter((rule) => headerNames(rule).has("sec-ch-ua"));
  assert.ok(clientHintRules.length > 0);
  assert.ok(clientHintRules.every((rule) => (
    rule.condition.urlFilter === "|https://"
    || rule.condition.urlFilter === "|wss://"
    || rule.condition.regexFilter?.startsWith("^https://")
    || rule.condition.regexFilter?.startsWith("^wss://")
  )));
  assert.ok(modifyRules
    .filter((rule) => !headerNames(rule).has("sec-ch-ua"))
    .every((rule) => !headerNames(rule).has("sec-ch-ua-platform")));

  const uaDisabledRules = buildHeaderRulesForTesting(normalizeSettings({
    ...settings,
    disableUserAgentSpoofing: true
  }));
  assert.ok(uaDisabledRules
    .filter((rule) => rule.action.type === "modifyHeaders")
    .every((rule) => {
      const names = headerNames(rule);
      return names.has("accept-language") && !names.has("user-agent") && !names.has("sec-ch-ua");
    }));
  assert.deepEqual(buildHeaderRulesForTesting(normalizeSettings({
    ...settings,
    excludedDomains: [DEFAULT_SITE_RULE]
  })), []);

  const excludedSettings = normalizeSettings({
    ...settings,
    excludedDomains: ["example.com/private"]
  });
  const excluded = resolveProfile("https://example.com/private/dashboard", excludedSettings, "lite");
  const tabRules = buildTabHeaderRulesForTesting(7, excluded, excludedSettings);
  assert.equal(tabRules.length, 1);
  assert.equal(tabRules[0].action.type, "allow");
  assert.deepEqual(tabRules[0].condition.tabIds, [7]);
  assert.equal(tabRules[0].condition.resourceTypes.includes("main_frame"), false);
  assert.equal(tabRules[0].condition.resourceTypes.includes("script"), true);

  const hostExcludedSettings = normalizeSettings({
    ...settings,
    excludedDomains: ["example.com"]
  });
  const hostExcludedRules = buildHeaderRulesForTesting(hostExcludedSettings);
  assert.ok(hostExcludedRules.some((rule) => (
    rule.action.type === "allow"
    && rule.condition.initiatorDomains?.includes("example.com")
    && rule.condition.resourceTypes?.includes("xmlhttprequest")
  )));
});

test("advanced overrides reuse, serialize, reset, and clean debugger sessions", async () => {
  const detachListeners = [];
  const calls = [];
  let attached = false;
  let attachCount = 0;
  let failMethod = "";
  const debuggerApi = {
    onDetach: {
      addListener(listener) {
        detachListeners.push(listener);
      }
    },
    async attach() {
      if (attached) {
        throw new Error("Another debugger is already attached to the tab with id: 7");
      }
      attached = true;
      attachCount += 1;
    },
    async detach(target) {
      if (!attached) {
        throw new Error("Debugger is not attached");
      }
      attached = false;
      for (const listener of detachListeners) {
        listener(target, "canceled_by_user");
      }
    },
    async sendCommand(_target, method, params) {
      if (!attached) {
        throw new Error("Debugger is not attached");
      }
      calls.push({ method, params });
      if (method === failMethod) {
        failMethod = "";
        throw new Error(`forced ${method} failure`);
      }
      if (method === "Emulation.setGeolocationOverride") {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      return {};
    }
  };
  const previousChrome = globalThis.chrome;
  globalThis.chrome = { debugger: debuggerApi };
  try {
    const { applyAdvancedOverrides, clearAdvancedOverrides } = await import("../dist/test/advanced-test-api.js");
    const firstProfile = { ...PRESET_PROFILES[0], userAgent: "Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36" };
    const secondProfile = { ...PRESET_PROFILES[1], userAgent: "Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36" };
    const [first, second] = await Promise.all([
      applyAdvancedOverrides(7, firstProfile, { userAgent: true }),
      applyAdvancedOverrides(7, secondProfile, { userAgent: true })
    ]);
    assert.equal(first.applied, true);
    assert.equal(second.applied, true);
    assert.equal(attachCount, 1);
    const userAgentCalls = calls.filter((call) => call.method === "Emulation.setUserAgentOverride");
    assert.match(userAgentCalls.at(-1).params.userAgent, /Chrome\/152/);

    const reset = await applyAdvancedOverrides(7, secondProfile, { userAgent: false });
    assert.equal(reset.applied, true);
    assert.equal(attachCount, 2);
    assert.equal(calls.filter((call) => call.method === "Emulation.setUserAgentOverride").length, 2);

    failMethod = "Emulation.setTimezoneOverride";
    const failed = await applyAdvancedOverrides(7, firstProfile, { userAgent: true });
    assert.equal(failed.applied, false);
    assert.match(failed.error, /forced/);
    assert.equal(attached, false);

    const recovered = await applyAdvancedOverrides(7, firstProfile, { userAgent: true });
    assert.equal(recovered.applied, true);
    await clearAdvancedOverrides(7);
    assert.equal(attached, false);
  } finally {
    globalThis.chrome = previousChrome;
  }
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

test("profiles can override user-agent and user-agent client hint architecture", () => {
  const profile = {
    ...PRESET_PROFILES[0],
    architecture: "arm",
    userAgent: "Mozilla/5.0 (Macintosh; ARM Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
  };
  assert.equal(userAgentForProfile(profile, "Mozilla/5.0 Chrome/150.0.7871.46 Safari/537.36"), profile.userAgent);
  assert.equal(appVersionForProfile(profile), "5.0 (Macintosh; ARM Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36");
  const metadata = userAgentMetadataForProfile(profile, "Mozilla/5.0 Chrome/150.0.7871.46 Safari/537.36");
  assert.ok(metadata);
  assert.equal(metadata.architecture, "arm");
  assert.equal(metadata.platform, "macOS");
  assert.deepEqual(metadata.brands.map((brand) => brand.version), ["151", "24", "151"]);

  const reducedArmProfile = {
    ...PRESET_PROFILES[0],
    platform: "MacIntel",
    architecture: "arm",
    userAgent: ""
  };
  assert.match(userAgentForProfile(reducedArmProfile), /Macintosh; Intel Mac OS X 10_15_7/);
  assert.equal(userAgentMetadataForProfile(reducedArmProfile)?.architecture, "arm");
  assert.equal(navigatorPlatformForProfile(reducedArmProfile), "MacIntel");
});

test("non-Chromium custom user-agents do not expose Chromium client hints", () => {
  const firefoxProfile = {
    ...PRESET_PROFILES[0],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0"
  };
  const safariProfile = {
    ...PRESET_PROFILES[0],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
  };
  assert.equal(userAgentMetadataForProfile(firefoxProfile), undefined);
  assert.equal(userAgentMetadataForProfile(safariProfile), undefined);
  assert.equal(navigatorVendorForProfile(firefoxProfile), "");
  assert.equal(navigatorVendorForProfile(safariProfile), "Apple Computer, Inc.");

  const operaProfile = {
    ...PRESET_PROFILES[0],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 OPR/117.0.0.0"
  };
  assert.equal(navigatorVendorForProfile(operaProfile), "Google Inc.");
  assert.equal(userAgentMetadataForProfile(operaProfile), undefined);

  const androidTabletProfile = {
    ...PRESET_PROFILES[0],
    architecture: "arm",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
  };
  assert.equal(userAgentMetadataForProfile(androidTabletProfile)?.mobile, false);
  assert.equal(navigatorPlatformForProfile(androidTabletProfile), "Linux armv81");
  assert.equal(navigatorPlatformForProfile({ ...PRESET_PROFILES[0], userAgent: safariProfile.userAgent }), "MacIntel");
});

test("settings migration strips control characters from custom user-agent", () => {
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    customProfiles: [{
      ...PRESET_PROFILES[0],
      id: "custom-user-agent",
      label: "Custom User-Agent",
      acceptLanguage: " en-US,en;q=0.9\r\n\t ",
      userAgent: " Mozilla/5.0\r\nChrome/151.0\tSafari/537.36\u0000 "
    }]
  });
  assert.equal(settings.customProfiles[0].userAgent, "Mozilla/5.0 Chrome/151.0 Safari/537.36");
  assert.equal(settings.customProfiles[0].acceptLanguage, "en-US,en;q=0.9");
  assert.doesNotMatch(settings.customProfiles[0].userAgent, /[\u0000-\u001f\u007f]/);
  assert.doesNotMatch(settings.customProfiles[0].acceptLanguage, /[\u0000-\u001f\u007f]/);
});

test("settings migration bounds profile values exposed to browser APIs", () => {
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    customProfiles: [{
      ...PRESET_PROFILES[0],
      id: "\u0000 hostile-profile ",
      locale: "not_a_locale",
      intlLocale: "still_not_a_locale",
      languages: ["bad_locale", "zh-cn", "zh-CN"],
      latitude: 999,
      longitude: -999,
      accuracy: -1,
      platform: "Forged",
      hardwareConcurrency: 10000,
      deviceMemory: 3,
      userAgent: "Mozilla/5.0 😀 Chrome/151.0"
    }]
  });
  const profile = settings.customProfiles[0];
  assert.equal(profile.id, "hostile-profile");
  assert.equal(profile.locale, PRESET_PROFILES[0].locale);
  assert.equal(profile.intlLocale, PRESET_PROFILES[0].locale);
  assert.deepEqual(profile.languages, ["zh-CN"]);
  assert.equal(profile.latitude, 90);
  assert.equal(profile.longitude, -180);
  assert.equal(profile.accuracy, 0);
  assert.equal(profile.platform, PRESET_PROFILES[0].platform);
  assert.equal(profile.hardwareConcurrency, 256);
  assert.equal(profile.deviceMemory, 2);
  assert.equal(profile.userAgent, "Mozilla/5.0 Chrome/151.0");
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
  assert.equal(resolveProfile("https://example.com", disabled, "lite").uaSpoofingEnabled, false);
  assert.equal(resolveProfile("https://example.com", disabled, "lite").reason, "global-disabled");

  const excluded = normalizeSettings({ ...DEFAULT_SETTINGS, excludedDomains: ["example.com"] });
  assert.equal(resolveProfile("https://sub.example.com", excluded, "lite").enabled, false);
  assert.equal(resolveProfile("https://sub.example.com", excluded, "lite").reason, "excluded-domain");

  const uaDisabled = normalizeSettings({ ...DEFAULT_SETTINGS, disableUserAgentSpoofing: true });
  assert.equal(resolveProfile("https://example.com", uaDisabled, "lite").enabled, true);
  assert.equal(resolveProfile("https://example.com", uaDisabled, "lite").uaSpoofingEnabled, false);

  const fileAndIpv6 = normalizeSettings({
    ...DEFAULT_SETTINGS,
    siteProfiles: {
      [FILE_SITE_RULE]: "tokyo-ja-jp",
      "[::1]": "beijing-zh-cn"
    },
    excludedDomains: ["[::1]/private"]
  });
  assert.equal(resolveProfile("file:///tmp/example.html", fileAndIpv6, "lite").profile.id, "tokyo-ja-jp");
  assert.equal(resolveProfile("http://[::1]:3000/", fileAndIpv6, "lite").profile.id, "beijing-zh-cn");
  assert.equal(resolveProfile("http://[::1]:3000/private", fileAndIpv6, "lite").enabled, false);
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

test("settings migration rejects malformed scalar settings", () => {
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    enabled: "false",
    advancedEnabled: "false",
    disableUserAgentSpoofing: "true",
    temporaryDisabledUntil: Number.NaN,
    siteNonces: {
      "example.com": 2.8,
      "bad.example": Number.NaN,
      "negative.example": -1
    }
  });
  assert.equal(settings.enabled, DEFAULT_SETTINGS.enabled);
  assert.equal(settings.advancedEnabled, DEFAULT_SETTINGS.advancedEnabled);
  assert.equal(settings.disableUserAgentSpoofing, DEFAULT_SETTINGS.disableUserAgentSpoofing);
  assert.equal(settings.temporaryDisabledUntil, null);
  assert.equal(settings.siteNonces["example.com"], 2);
  assert.equal(settings.siteNonces["bad.example"], undefined);
  assert.equal(settings.siteNonces["negative.example"], undefined);
});

test("settings normalization keeps generated DNR rules below browser quotas", () => {
  const siteProfiles = Object.fromEntries(Array.from({ length: 700 }, (_, index) => [
    `site-${index}.example`,
    PRESET_PROFILES[index % PRESET_PROFILES.length].id
  ]));
  const excludedDomains = Array.from({ length: 600 }, (_, index) => `excluded-${index}.example/path`);
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    excludedDefaultsVersion: 1,
    siteProfiles,
    excludedDomains
  });
  assert.ok(Object.keys(settings.siteProfiles).length <= 500);
  assert.ok(settings.excludedDomains.length <= 400);
  assert.ok(buildHeaderRulesForTesting(settings).length <= 4500);
  const hostExcludedSettings = normalizeSettings({
    ...settings,
    excludedDomains: Array.from({ length: 600 }, (_, index) => `excluded-${index}.example`)
  });
  assert.equal(hostExcludedSettings.excludedDomains.length, 400);
  assert.ok(buildHeaderRulesForTesting(hostExcludedSettings).length <= 4500);
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
