import { localePresetFor, locationPresetForTimezone, supportedTimezoneIdOrNull } from "./locations";
import type { AutomaticLanguageMode, AutomaticLocation, Profile } from "./types";

export const IPPURE_INFO_URL = "https://my.ippure.com/v1/info";
export const AUTOMATIC_LOCATION_ACCURACY_METERS = 25_000;

const COUNTRY_LOCALES: Readonly<Record<string, string>> = Object.freeze({
  AE: "ar-AE",
  AR: "es-AR",
  AT: "de-AT",
  AU: "en-AU",
  BE: "nl-BE",
  BG: "bg-BG",
  BR: "pt-BR",
  CA: "en-CA",
  CH: "de-CH",
  CL: "es-CL",
  CN: "zh-CN",
  CO: "es-CO",
  CR: "es-CR",
  CY: "el-CY",
  CZ: "cs-CZ",
  DE: "de-DE",
  DK: "da-DK",
  EE: "et-EE",
  ES: "es-ES",
  FI: "fi-FI",
  FR: "fr-FR",
  GB: "en-GB",
  GR: "el-GR",
  HK: "zh-HK",
  HR: "hr-HR",
  HU: "hu-HU",
  ID: "id-ID",
  IE: "en-IE",
  IL: "he-IL",
  IN: "en-IN",
  IS: "is-IS",
  IT: "it-IT",
  JP: "ja-JP",
  KR: "ko-KR",
  LT: "lt-LT",
  LU: "fr-LU",
  LV: "lv-LV",
  MD: "ro-MD",
  MX: "es-MX",
  MY: "ms-MY",
  NL: "nl-NL",
  NO: "nb-NO",
  NZ: "en-NZ",
  PE: "es-PE",
  PH: "en-PH",
  PL: "pl-PL",
  PT: "pt-PT",
  RO: "ro-RO",
  RS: "sr-RS",
  RU: "ru-RU",
  SA: "ar-SA",
  SE: "sv-SE",
  SG: "en-SG",
  SI: "sl-SI",
  SK: "sk-SK",
  TH: "th-TH",
  TR: "tr-TR",
  TW: "zh-TW",
  UA: "uk-UA",
  US: "en-US",
  VN: "vi-VN",
  ZA: "en-ZA"
});

export function parseIpPureLocation(value: unknown, updatedAt = Date.now()): AutomaticLocation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const response = value as Record<string, unknown>;
  return buildAutomaticLocation({
    timezoneId: response.timezone,
    latitude: response.latitude,
    longitude: response.longitude,
    countryCode: response.countryCode,
    country: response.country,
    region: response.region,
    city: response.city,
    updatedAt
  });
}

export function normalizeAutomaticLocation(value: unknown): AutomaticLocation | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const location = value as Record<string, unknown>;
  return buildAutomaticLocation(location);
}

export function applyAutomaticLocation(
  profile: Profile,
  location: AutomaticLocation | null,
  languageMode: AutomaticLanguageMode
): Profile {
  if (!location) {
    return profile;
  }
  const next: Profile = {
    ...profile,
    timezoneId: location.timezoneId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: AUTOMATIC_LOCATION_ACCURACY_METERS
  };
  if (languageMode !== "auto") {
    return next;
  }
  const locale = automaticLocaleForLocation(location);
  if (!locale) {
    return next;
  }
  const language = languageProfileForLocale(locale);
  return {
    ...next,
    locale: language.locale,
    intlLocale: language.locale,
    languages: language.languages,
    acceptLanguage: language.acceptLanguage
  };
}

export function sameAutomaticLocation(left: AutomaticLocation | null, right: AutomaticLocation | null): boolean {
  if (!left || !right) {
    return left === right;
  }
  return left.timezoneId === right.timezoneId
    && left.latitude === right.latitude
    && left.longitude === right.longitude
    && left.countryCode === right.countryCode;
}

export function automaticLocaleForLocation(location: AutomaticLocation): string | null {
  const locationLocale = locationPresetForTimezone(location.timezoneId)?.locale;
  const candidate = COUNTRY_LOCALES[location.countryCode] ?? locationLocale;
  if (!candidate) {
    return null;
  }
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

function buildAutomaticLocation(value: Record<string, unknown>): AutomaticLocation | null {
  const timezoneCandidate = boundedString(value.timezoneId, 128);
  const timezoneId = timezoneCandidate ? supportedTimezoneIdOrNull(timezoneCandidate) : null;
  const latitude = coordinate(value.latitude, -90, 90);
  const longitude = coordinate(value.longitude, -180, 180);
  const countryCode = boundedString(value.countryCode, 2).toUpperCase();
  const updatedAt = finiteNumber(value.updatedAt);
  if (!timezoneId || latitude === null || longitude === null || !/^[A-Z]{2}$/.test(countryCode) || updatedAt === null || updatedAt < 0) {
    return null;
  }
  return {
    timezoneId,
    latitude,
    longitude,
    countryCode,
    country: boundedString(value.country, 128),
    region: boundedString(value.region, 128),
    city: boundedString(value.city, 128),
    updatedAt
  };
}

function languageProfileForLocale(locale: string): Pick<Profile, "locale" | "languages" | "acceptLanguage"> {
  const preset = localePresetFor(locale);
  if (preset) {
    return {
      locale: preset.locale,
      languages: [...preset.languages],
      acceptLanguage: preset.acceptLanguage
    };
  }
  const primaryLanguage = new Intl.Locale(locale).language;
  const languages = [locale, primaryLanguage];
  if (primaryLanguage !== "en") {
    languages.push("en-US", "en");
  }
  const uniqueLanguages = [...new Set(languages)];
  const acceptLanguage = uniqueLanguages
    .map((language, index) => index === 0 ? language : `${language};q=${Math.max(0.5, 1 - index * 0.1).toFixed(1)}`)
    .join(",");
  return { locale, languages: uniqueLanguages, acceptLanguage };
}

function coordinate(value: unknown, minimum: number, maximum: number): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= minimum && number <= maximum ? number : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}
