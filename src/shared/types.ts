import type { HeliumFlagDetection } from "./helium-detect";

export type BuildTarget = "lite" | "advanced";

export type UaMode = "desktop-chromium" | "native";
export type AutomaticLanguageMode = "auto" | "profile";

export interface AutomaticLocation {
  timezoneId: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  country: string;
  region: string;
  city: string;
  updatedAt: number;
}

export type ScreenResolution = "auto" | { width: number; height: number };
export type KeyboardLayoutSetting = "auto" | "us" | "uk" | "de" | "fr" | "jp";
export type VoiceSetting = "auto" | "none" | string[];

export interface Profile {
  id: string;
  label: string;
  locale: string;
  intlLocale: string;
  languages: string[];
  timezoneId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  acceptLanguage: string;
  platform: string;
  architecture: string;
  /** Sec-CH-UA-Platform-Version / getHighEntropyValues value; empty picks a current default for the platform. */
  platformVersion: string;
  userAgent: string;
  uaMode: UaMode;
  deviceMemory: number;
  screenResolution?: ScreenResolution;
  keyboardLayout?: KeyboardLayoutSetting;
  voices?: VoiceSetting;
  canvasSeedPolicy: "site";
  webglVendor: string;
  webglRenderer: string;
}

export interface GhostSettings {
  enabled: boolean;
  mediaDeviceListEnabled: boolean;
  singleScreenEnabled: boolean;
  advancedEnabled: boolean;
  disableUserAgentSpoofing: boolean;
  disableCanvasMeasureTextSpoofing: boolean;
  disableWebglInfoSpoofing: boolean;
  heliumFlagSync: boolean;
  automaticLocationEnabled: boolean;
  automaticLanguageMode: AutomaticLanguageMode;
  automaticLocation: AutomaticLocation | null;
  siteProfiles: Record<string, string>;
  siteNonces: Record<string, number>;
  excludedDomains: string[];
  excludedDefaultsVersion: number;
  temporaryDisabledUntil: number | null;
  customProfiles: Profile[];
  hiddenPresetProfileIds: string[];
}

export interface ResolvedProfile {
  build: BuildTarget;
  enabled: boolean;
  mediaDeviceListEnabled: boolean;
  singleScreenEnabled: boolean;
  uaSpoofingEnabled: boolean;
  canvasMeasureTextSpoofingEnabled: boolean;
  webglInfoSpoofingEnabled: boolean;
  reason?: "global-disabled" | "temporary-disabled" | "excluded-domain" | "unsupported-url";
  siteKey: string;
  seed: string;
  profile: Profile;
  advanced: {
    available: boolean;
    attempted: boolean;
    applied: boolean;
    error?: string;
  };
}

export interface PopupState {
  build: BuildTarget;
  settings: GhostSettings;
  url: string;
  siteKey: string;
  supportedPage: boolean;
  fileAccessRequired: boolean;
  earlyBootstrapAvailable: boolean;
  enabledForSite: boolean;
  profile: Profile;
  profiles: Profile[];
  advancedAvailable: boolean;
}

export type RuntimeRequest =
  | { type: "resolveProfile"; url: string }
  | { type: "getPopupState"; url: string }
  | { type: "setGlobalEnabled"; enabled: boolean }
  | { type: "setSiteEnabled"; siteKey: string; url: string; enabled: boolean }
  | { type: "setSiteProfile"; siteKey: string; profileId: string }
  | { type: "regenerateSiteProfile"; siteKey: string }
  | { type: "setTemporaryDisable"; durationMs: number }
  | { type: "syncHeliumFlags"; detection: HeliumFlagDetection }
  | { type: "options.getState" }
  | { type: "options.saveState"; settings: GhostSettings }
  | { type: "options.refreshAutomaticLocation" }
  | { type: "options.resetState" };

export type RuntimeResponse =
  | { ok: true; value?: unknown }
  | { ok: false; error: string };
