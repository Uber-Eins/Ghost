export { canvasFontHasBlockedFamily, profileAllowsCjkFonts, sanitizeCanvasFont } from "./shared/fonts";
export { constructDateWithNewTarget } from "./shared/date-constructor";
export { repairContentBootstrap } from "./background/bootstrap";
export { fnv1a, stableSeed } from "./shared/hash";
export {
  applyHeliumFlagDetection,
  classifyClientHints,
  isSpoofedWebglInfo,
  normalizeHeliumFlagDetection,
  uaReductionFromClientHints
} from "./shared/helium-detect";
export { isAccessiblePageUrl, isSupportedPageUrl, senderBoundPageUrl } from "./shared/internal";
export {
  applyLocalePreset,
  applyLocationPreset,
  FIXED_OFFSET_TIMEZONES,
  LOCALE_PRESETS,
  LOCATION_PRESETS,
  normalizeTimezoneId,
  PLATFORM_OPTIONS,
  SUPPORTED_TIMEZONES,
  timezoneLabel,
  timezoneRegion,
  timezoneRegions,
  timezonesForRegion
} from "./shared/locations";
export {
  allProfiles,
  appVersionForProfile,
  navigatorPlatformForProfile,
  navigatorVendorForProfile,
  PRESET_PROFILES,
  stableProfileIdForSite,
  userAgentForProfile,
  userAgentMetadataForProfile,
  webgpuAdapterInfoForProfile
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
export {
  dateFromZonedLocalParts,
  fixedOffsetMinutes,
  getTimezoneOffsetMinutes,
  utcOffsetLabel,
  utcOffsetMinutes
} from "./shared/timezone";
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
