import { stableIndex } from "./hash";
import type { Profile } from "./types";

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

export function userAgentMetadataForProfile(profile: Profile, nativeUserAgent = ""): Record<string, unknown> {
  const major = chromiumMajorFromUserAgent(nativeUserAgent);
  return {
    brands: [
      { brand: "Chromium", version: major },
      { brand: "Not=A?Brand", version: "24" },
      { brand: "Google Chrome", version: major }
    ],
    fullVersionList: [
      { brand: "Chromium", version: `${major}.0.0.0` },
      { brand: "Not=A?Brand", version: "24.0.0.0" },
      { brand: "Google Chrome", version: `${major}.0.0.0` }
    ],
    platform: uaPlatformForProfile(profile),
    platformVersion: "10.0.0",
    architecture: "x86",
    model: "",
    mobile: false,
    bitness: "64",
    wow64: false
  };
}

export function fallbackProfileForSite(siteKey: string): Profile {
  const profileId = stableProfileIdForSite(siteKey, PRESET_PROFILES);
  return findProfile(profileId, []);
}
