export { canvasFontHasBlockedFamily, profileAllowsCjkFonts, sanitizeCanvasFont } from "./shared/fonts";
export { repairContentBootstrap } from "./background/bootstrap";
export { fnv1a, stableSeed } from "./shared/hash";
export { isAccessiblePageUrl, isSupportedPageUrl, senderBoundPageUrl } from "./shared/internal";
export {
  applyLocalePreset,
  applyLocationPreset,
  LOCALE_PRESETS,
  LOCATION_PRESETS,
  normalizeTimezoneId,
  PLATFORM_OPTIONS,
  SUPPORTED_TIMEZONES
} from "./shared/locations";
export {
  allProfiles,
  appVersionForProfile,
  navigatorPlatformForProfile,
  navigatorVendorForProfile,
  PRESET_PROFILES,
  stableProfileIdForSite,
  userAgentForProfile,
  userAgentMetadataForProfile
} from "./shared/profiles";
export {
  DEFAULT_SITE_RULE,
  FILE_SITE_RULE,
  bestMatchingSiteRule,
  exclusionAppliesToSiteKey,
  exclusionsForSiteToggle,
  isExcludedUrl,
  normalizeExclusionRule,
  normalizeSiteRuleKey,
  requestFilePathStartRegexFilter,
  requestHostPathStartRegexFilter,
  requestPathStartRegexFilter,
  siteKeyFromHostname,
  siteKeyFromUrl,
  urlMatchesHostPathRule
} from "./shared/site";
export { dateFromZonedLocalParts, getTimezoneOffsetMinutes } from "./shared/timezone";
export {
  DEFAULT_EXCLUDED_DOMAINS,
  DEFAULT_SETTINGS,
  headerRulesAllowed,
  loadSettings,
  normalizeSettings,
  profileIdForSiteKey,
  profilesFromSettings,
  resolveProfile,
  saveSettings,
  updateSettings
} from "./shared/storage";
export type { GhostSettings } from "./shared/types";
