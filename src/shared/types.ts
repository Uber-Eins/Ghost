export type BuildTarget = "lite" | "advanced";

export type UaMode = "desktop-chromium" | "native";

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
  uaMode: UaMode;
  hardwareConcurrency: number;
  deviceMemory: number;
  canvasSeedPolicy: "site";
  webglVendor: string;
  webglRenderer: string;
}

export interface GhostSettings {
  enabled: boolean;
  advancedEnabled: boolean;
  siteProfiles: Record<string, string>;
  siteNonces: Record<string, number>;
  excludedDomains: string[];
  temporaryDisabledUntil: number | null;
  customProfiles: Profile[];
}

export interface ResolvedProfile {
  build: BuildTarget;
  enabled: boolean;
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
  siteKey: string;
  supportedPage: boolean;
  enabledForSite: boolean;
  profile: Profile;
  profiles: Profile[];
  advancedAvailable: boolean;
}

export type RuntimeRequest =
  | { type: "resolveProfile"; url: string }
  | { type: "getPopupState"; url: string }
  | { type: "setGlobalEnabled"; enabled: boolean }
  | { type: "setSiteEnabled"; siteKey: string; enabled: boolean }
  | { type: "setSiteProfile"; siteKey: string; profileId: string }
  | { type: "regenerateSiteProfile"; siteKey: string }
  | { type: "setTemporaryDisable"; durationMs: number }
  | { type: "options.getState" }
  | { type: "options.saveState"; settings: GhostSettings }
  | { type: "options.resetState" };

export type RuntimeResponse =
  | { ok: true; value?: unknown }
  | { ok: false; error: string };
