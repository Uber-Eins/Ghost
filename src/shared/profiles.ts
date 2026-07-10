import { stableIndex } from "./hash";
import type { Profile } from "./types";

export interface UserAgentBrandVersion {
  brand: string;
  version: string;
}

export interface UserAgentMetadata {
  brands: UserAgentBrandVersion[];
  fullVersionList: UserAgentBrandVersion[];
  platform: string;
  platformVersion: string;
  architecture: string;
  model: string;
  mobile: boolean;
  bitness: string;
  wow64: boolean;
}

export const PRESET_PROFILES: Profile[] = [
  {
    id: "los-angeles-en-us",
    label: "Los Angeles / en-US",
    locale: "en-US",
    intlLocale: "en-US",
    languages: ["en-US", "en"],
    timezoneId: "America/Los_Angeles",
    latitude: 34.0522,
    longitude: -118.2437,
    accuracy: 80,
    acceptLanguage: "en-US,en;q=0.9",
    platform: "Win32",
    architecture: "x86",
    userAgent: "",
    uaMode: "desktop-chromium",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    canvasSeedPolicy: "site",
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    id: "new-york-en-us",
    label: "New York / en-US",
    locale: "en-US",
    intlLocale: "en-US",
    languages: ["en-US", "en"],
    timezoneId: "America/New_York",
    latitude: 40.7128,
    longitude: -74.006,
    accuracy: 65,
    acceptLanguage: "en-US,en;q=0.9",
    platform: "Win32",
    architecture: "x86",
    userAgent: "",
    uaMode: "desktop-chromium",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    canvasSeedPolicy: "site",
    webglVendor: "Google Inc. (NVIDIA)",
    webglRenderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    id: "london-en-gb",
    label: "London / en-GB",
    locale: "en-GB",
    intlLocale: "en-GB",
    languages: ["en-GB", "en"],
    timezoneId: "Europe/London",
    latitude: 51.5072,
    longitude: -0.1276,
    accuracy: 70,
    acceptLanguage: "en-GB,en;q=0.9",
    platform: "Win32",
    architecture: "x86",
    userAgent: "",
    uaMode: "desktop-chromium",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    canvasSeedPolicy: "site",
    webglVendor: "Google Inc. (AMD)",
    webglRenderer: "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    id: "berlin-de-de",
    label: "Berlin / de-DE",
    locale: "de-DE",
    intlLocale: "de-DE",
    languages: ["de-DE", "de", "en-US", "en"],
    timezoneId: "Europe/Berlin",
    latitude: 52.52,
    longitude: 13.405,
    accuracy: 75,
    acceptLanguage: "de-DE,de;q=0.9,en-US;q=0.7,en;q=0.6",
    platform: "Win32",
    architecture: "x86",
    userAgent: "",
    uaMode: "desktop-chromium",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    canvasSeedPolicy: "site",
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    id: "tokyo-ja-jp",
    label: "Tokyo / ja-JP",
    locale: "ja-JP",
    intlLocale: "ja-JP",
    languages: ["ja-JP", "ja", "en-US", "en"],
    timezoneId: "Asia/Tokyo",
    latitude: 35.6762,
    longitude: 139.6503,
    accuracy: 85,
    acceptLanguage: "ja-JP,ja;q=0.9,en-US;q=0.7,en;q=0.6",
    platform: "Win32",
    architecture: "x86",
    userAgent: "",
    uaMode: "desktop-chromium",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    canvasSeedPolicy: "site",
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    id: "beijing-zh-cn",
    label: "Beijing / zh-CN",
    locale: "zh-CN",
    intlLocale: "zh-CN",
    languages: ["zh-CN", "zh", "en-US", "en"],
    timezoneId: "Asia/Shanghai",
    latitude: 39.9042,
    longitude: 116.4074,
    accuracy: 90,
    acceptLanguage: "zh-CN,zh;q=0.9,en-US;q=0.7,en;q=0.6",
    platform: "Win32",
    architecture: "x86",
    userAgent: "",
    uaMode: "desktop-chromium",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    canvasSeedPolicy: "site",
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  },
  {
    id: "singapore-en-sg",
    label: "Singapore / en-SG",
    locale: "en-SG",
    intlLocale: "en-SG",
    languages: ["en-SG", "en-US", "en"],
    timezoneId: "Asia/Singapore",
    latitude: 1.3521,
    longitude: 103.8198,
    accuracy: 60,
    acceptLanguage: "en-SG,en-US;q=0.9,en;q=0.8",
    platform: "Win32",
    architecture: "x86",
    userAgent: "",
    uaMode: "desktop-chromium",
    hardwareConcurrency: 8,
    deviceMemory: 8,
    canvasSeedPolicy: "site",
    webglVendor: "Google Inc. (Intel)",
    webglRenderer: "ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)"
  }
];

export const PRESET_PROFILE_IDS = new Set(PRESET_PROFILES.map((profile) => profile.id));

export function cloneProfile(profile: Profile): Profile {
  return {
    ...profile,
    languages: [...profile.languages]
  };
}

export function defaultProfiles(): Profile[] {
  return PRESET_PROFILES.map(cloneProfile);
}

export function allProfiles(customProfiles: Profile[], hiddenPresetProfileIds: string[] = []): Profile[] {
  const hidden = new Set(hiddenPresetProfileIds);
  const profilesById = new Map(PRESET_PROFILES
    .filter((profile) => !hidden.has(profile.id))
    .map((profile) => [profile.id, cloneProfile(profile)]));
  for (const profile of customProfiles) {
    profilesById.set(profile.id, cloneProfile(profile));
  }
  return [...profilesById.values()];
}

export function findProfile(profileId: string | undefined, customProfiles: Profile[], hiddenPresetProfileIds: string[] = []): Profile {
  const profiles = allProfiles(customProfiles, hiddenPresetProfileIds);
  return cloneProfile(profiles.find((profile) => profile.id === profileId) ?? profiles[0] ?? PRESET_PROFILES[0]);
}

export function stableProfileIdForSite(siteKey: string, profiles: Profile[], nonce = 0): string {
  const index = stableIndex(`${siteKey}:${nonce}`, profiles.length);
  return profiles[index]?.id ?? PRESET_PROFILES[0].id;
}

export function chromiumMajorFromUserAgent(userAgent: string): string {
  const match = userAgent.match(/(?:Chrome|Chromium|Edg)\/(\d+)/);
  return match?.[1] ?? "126";
}

export function userAgentForProfile(profile: Profile, nativeUserAgent = ""): string {
  const customUserAgent = typeof profile.userAgent === "string" ? profile.userAgent.trim() : "";
  if (customUserAgent) {
    return customUserAgent;
  }
  if (profile.uaMode === "native" && nativeUserAgent) {
    return nativeUserAgent;
  }

  const major = chromiumMajorFromUserAgent(nativeUserAgent);
  const platformSegment = profile.platform === "MacIntel"
    ? "Macintosh; Intel Mac OS X 10_15_7"
    : profile.platform.startsWith("Linux")
      ? "X11; Linux x86_64"
      : "Windows NT 10.0; Win64; x64";

  return `Mozilla/5.0 (${platformSegment}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

export function appVersionForProfile(profile: Profile, nativeUserAgent = ""): string {
  return userAgentForProfile(profile, nativeUserAgent).replace(/^Mozilla\//, "");
}

export function runtimeUserAgent(): string {
  return globalThis.navigator?.userAgent ?? "";
}

export function uaPlatformForProfile(profile: Profile): string {
  if (profile.platform === "MacIntel") {
    return "macOS";
  }
  if (profile.platform.startsWith("Linux")) {
    return "Linux";
  }
  return "Windows";
}

export function navigatorPlatformForProfile(profile: Profile, nativeUserAgent = ""): string {
  const userAgent = userAgentForProfile(profile, nativeUserAgent);
  if (/\bAndroid\b/i.test(userAgent)) {
    return "Linux armv81";
  }
  if (/\biPhone\b/i.test(userAgent)) {
    return "iPhone";
  }
  if (/\biPad\b/i.test(userAgent)) {
    return "iPad";
  }
  if (/\b(?:Macintosh|Mac OS X)\b/i.test(userAgent)) {
    return "MacIntel";
  }
  if (/\bWindows NT\b/i.test(userAgent)) {
    return "Win32";
  }
  if (/\bLinux\b/i.test(userAgent)) {
    return "Linux x86_64";
  }
  return profile.platform;
}

export function navigatorVendorForProfile(profile: Profile, nativeUserAgent = ""): string {
  const userAgent = userAgentForProfile(profile, nativeUserAgent);
  if (/\bFirefox\//.test(userAgent)) {
    return "";
  }
  if (/\b(?:Chrome|Chromium|OPR|Opera|Edg)\//.test(userAgent)) {
    return "Google Inc.";
  }
  if (/\bVersion\//.test(userAgent) && /\bSafari\//.test(userAgent)) {
    return "Apple Computer, Inc.";
  }
  return chromiumBrowserFromUserAgent(userAgent) ? "Google Inc." : "";
}

export function userAgentMetadataForProfile(profile: Profile, nativeUserAgent = ""): UserAgentMetadata | undefined {
  const userAgent = userAgentForProfile(profile, nativeUserAgent);
  const browser = chromiumBrowserFromUserAgent(userAgent);
  if (!browser) {
    return undefined;
  }
  const platform = platformFromUserAgent(userAgent) ?? uaPlatformForProfile(profile);
  return {
    brands: brandsForChromiumBrowser(browser.name, browser.major),
    fullVersionList: fullVersionListForChromiumBrowser(browser.name, browser.version),
    platform,
    platformVersion: platformVersionFromUserAgent(userAgent, platform),
    architecture: typeof profile.architecture === "string" && profile.architecture ? profile.architecture : "x86",
    model: "",
    mobile: isMobileUserAgent(userAgent),
    bitness: "64",
    wow64: false
  };
}

export function secChUaHeaderValue(metadata: UserAgentMetadata): string {
  return metadata.brands
    .map((brand) => `"${escapeHeaderBrand(brand.brand)}";v="${escapeHeaderBrand(brand.version)}"`)
    .join(", ");
}

type ChromiumBrowserName = "chromium" | "chrome" | "edge";

interface ChromiumBrowser {
  name: ChromiumBrowserName;
  version: string;
  major: string;
}

function chromiumBrowserFromUserAgent(userAgent: string): ChromiumBrowser | null {
  const edge = userAgent.match(/\bEdg\/([0-9][0-9A-Za-z._-]*)/);
  if (edge?.[1]) {
    return chromiumBrowser("edge", edge[1]);
  }
  const chrome = userAgent.match(/\bChrome\/([0-9][0-9A-Za-z._-]*)/);
  if (chrome?.[1] && !/\b(?:OPR|Opera)\//.test(userAgent)) {
    return chromiumBrowser("chrome", chrome[1]);
  }
  const chromium = userAgent.match(/\bChromium\/([0-9][0-9A-Za-z._-]*)/);
  if (chromium?.[1]) {
    return chromiumBrowser("chromium", chromium[1]);
  }
  return null;
}

function chromiumBrowser(name: ChromiumBrowserName, version: string): ChromiumBrowser {
  const normalizedVersion = normalizeVersion(version);
  return {
    name,
    version: normalizedVersion,
    major: normalizedVersion.split(".")[0] || "126"
  };
}

function brandsForChromiumBrowser(name: ChromiumBrowserName, major: string): UserAgentBrandVersion[] {
  const brands = [
    { brand: "Chromium", version: major },
    { brand: "Not=A?Brand", version: "24" }
  ];
  if (name === "chrome") {
    brands.push({ brand: "Google Chrome", version: major });
  } else if (name === "edge") {
    brands.push({ brand: "Microsoft Edge", version: major });
  }
  return brands;
}

function fullVersionListForChromiumBrowser(name: ChromiumBrowserName, version: string): UserAgentBrandVersion[] {
  const brands = [
    { brand: "Chromium", version },
    { brand: "Not=A?Brand", version: "24.0.0.0" }
  ];
  if (name === "chrome") {
    brands.push({ brand: "Google Chrome", version });
  } else if (name === "edge") {
    brands.push({ brand: "Microsoft Edge", version });
  }
  return brands;
}

function normalizeVersion(version: string): string {
  const parts = version.replace(/_/g, ".").split(".").filter(Boolean);
  while (parts.length < 4) {
    parts.push("0");
  }
  return parts.slice(0, 4).map((part) => part.replace(/\D/g, "") || "0").join(".");
}

function platformFromUserAgent(userAgent: string): string | null {
  if (/\bAndroid\b/i.test(userAgent)) {
    return "Android";
  }
  if (/\b(?:iPhone|iPad|iPod)\b/i.test(userAgent)) {
    return "iOS";
  }
  if (/\b(?:Macintosh|Mac OS X)\b/i.test(userAgent)) {
    return "macOS";
  }
  if (/\bWindows NT\b/i.test(userAgent)) {
    return "Windows";
  }
  if (/\bLinux\b/i.test(userAgent)) {
    return "Linux";
  }
  return null;
}

function platformVersionFromUserAgent(userAgent: string, platform: string): string {
  if (platform === "Windows") {
    return normalizePlatformVersion(userAgent.match(/\bWindows NT ([0-9._]+)/)?.[1] ?? "10.0.0");
  }
  if (platform === "macOS") {
    return normalizePlatformVersion(userAgent.match(/\bMac OS X ([0-9._]+)/)?.[1] ?? "10.15.7");
  }
  if (platform === "Android") {
    return normalizePlatformVersion(userAgent.match(/\bAndroid ([0-9._]+)/)?.[1] ?? "10.0.0");
  }
  if (platform === "iOS") {
    return normalizePlatformVersion(userAgent.match(/\b(?:CPU(?: iPhone)? OS|iPhone OS) ([0-9._]+)/)?.[1] ?? "16.0.0");
  }
  return "0.0.0";
}

function normalizePlatformVersion(version: string): string {
  const parts = version.replace(/_/g, ".").split(".").filter(Boolean);
  while (parts.length < 3) {
    parts.push("0");
  }
  return parts.slice(0, 3).map((part) => part.replace(/\D/g, "") || "0").join(".");
}

function isMobileUserAgent(userAgent: string): boolean {
  return /\b(?:Mobile|iPhone|iPod)\b/i.test(userAgent);
}

function escapeHeaderBrand(value: string): string {
  return value.replace(/[\\"]/g, "");
}

export function fallbackProfileForSite(siteKey: string): Profile {
  if (siteKey === "*") {
    return findProfile(PRESET_PROFILES[0].id, []);
  }
  const profileId = stableProfileIdForSite(siteKey, PRESET_PROFILES);
  return findProfile(profileId, []);
}
