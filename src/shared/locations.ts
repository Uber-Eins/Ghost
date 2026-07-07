import type { Profile } from "./types";

export interface LocalePreset {
  locale: string;
  label: string;
  intlLocale: string;
  languages: string[];
  acceptLanguage: string;
  defaultLocationId: string;
}

export interface LocationPreset {
  id: string;
  label: string;
  city: string;
  country: string;
  timezoneId: string;
  locale: string;
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface PlatformOption {
  value: string;
  label: string;
}

export const FALLBACK_TIMEZONES = [
  "America/Los_Angeles",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Saigon",
  "Asia/Jakarta",
  "Asia/Calcutta",
  "Asia/Riyadh",
  "Australia/Sydney"
];
export const DEFAULT_TIMEZONE = FALLBACK_TIMEZONES[0];
export const SUPPORTED_TIMEZONES = supportedTimezones();
export const TIMEZONE_REGIONS = [...new Set(SUPPORTED_TIMEZONES.map(timezoneRegion))].sort();

const SUPPORTED_TIMEZONE_SET = new Set(SUPPORTED_TIMEZONES);
const TIMEZONE_ALIASES: Record<string, string[]> = {
  "Asia/Ho_Chi_Minh": ["Asia/Saigon"],
  "Asia/Saigon": ["Asia/Ho_Chi_Minh"],
  "Asia/Kolkata": ["Asia/Calcutta"],
  "Asia/Calcutta": ["Asia/Kolkata"]
};

export const LOCALE_PRESETS: LocalePreset[] = [
  {
    locale: "en-US",
    label: "English (United States)",
    intlLocale: "en-US",
    languages: ["en-US", "en"],
    acceptLanguage: "en-US,en;q=0.9",
    defaultLocationId: "los-angeles"
  },
  {
    locale: "en-CA",
    label: "English (Canada)",
    intlLocale: "en-CA",
    languages: ["en-CA", "en-US", "en"],
    acceptLanguage: "en-CA,en-US;q=0.9,en;q=0.8",
    defaultLocationId: "toronto"
  },
  {
    locale: "es-US",
    label: "Español (Estados Unidos)",
    intlLocale: "es-US",
    languages: ["es-US", "es", "en-US", "en"],
    acceptLanguage: "es-US,es;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "new-york"
  },
  {
    locale: "en-GB",
    label: "English (United Kingdom)",
    intlLocale: "en-GB",
    languages: ["en-GB", "en"],
    acceptLanguage: "en-GB,en;q=0.9",
    defaultLocationId: "london"
  },
  {
    locale: "fr-FR",
    label: "Français (France)",
    intlLocale: "fr-FR",
    languages: ["fr-FR", "fr", "en-US", "en"],
    acceptLanguage: "fr-FR,fr;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "paris"
  },
  {
    locale: "de-DE",
    label: "Deutsch (Deutschland)",
    intlLocale: "de-DE",
    languages: ["de-DE", "de", "en-US", "en"],
    acceptLanguage: "de-DE,de;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "berlin"
  },
  {
    locale: "es-ES",
    label: "Español (España)",
    intlLocale: "es-ES",
    languages: ["es-ES", "es", "en-US", "en"],
    acceptLanguage: "es-ES,es;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "madrid"
  },
  {
    locale: "it-IT",
    label: "Italiano (Italia)",
    intlLocale: "it-IT",
    languages: ["it-IT", "it", "en-US", "en"],
    acceptLanguage: "it-IT,it;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "rome"
  },
  {
    locale: "nl-NL",
    label: "Nederlands (Nederland)",
    intlLocale: "nl-NL",
    languages: ["nl-NL", "nl", "en-US", "en"],
    acceptLanguage: "nl-NL,nl;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "amsterdam"
  },
  {
    locale: "sv-SE",
    label: "Svenska (Sverige)",
    intlLocale: "sv-SE",
    languages: ["sv-SE", "sv", "en-US", "en"],
    acceptLanguage: "sv-SE,sv;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "stockholm"
  },
  {
    locale: "pl-PL",
    label: "Polski (Polska)",
    intlLocale: "pl-PL",
    languages: ["pl-PL", "pl", "en-US", "en"],
    acceptLanguage: "pl-PL,pl;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "warsaw"
  },
  {
    locale: "pt-BR",
    label: "Português (Brasil)",
    intlLocale: "pt-BR",
    languages: ["pt-BR", "pt", "en-US", "en"],
    acceptLanguage: "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "sao-paulo"
  },
  {
    locale: "es-MX",
    label: "Español (México)",
    intlLocale: "es-MX",
    languages: ["es-MX", "es", "en-US", "en"],
    acceptLanguage: "es-MX,es;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "mexico-city"
  },
  {
    locale: "ja-JP",
    label: "日本語 (日本)",
    intlLocale: "ja-JP",
    languages: ["ja-JP", "ja", "en-US", "en"],
    acceptLanguage: "ja-JP,ja;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "tokyo"
  },
  {
    locale: "ko-KR",
    label: "한국어 (대한민국)",
    intlLocale: "ko-KR",
    languages: ["ko-KR", "ko", "en-US", "en"],
    acceptLanguage: "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "seoul"
  },
  {
    locale: "zh-CN",
    label: "简体中文 (中国大陆)",
    intlLocale: "zh-CN",
    languages: ["zh-CN", "zh", "en-US", "en"],
    acceptLanguage: "zh-CN,zh;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "beijing"
  },
  {
    locale: "zh-TW",
    label: "繁體中文 (台灣)",
    intlLocale: "zh-TW",
    languages: ["zh-TW", "zh", "en-US", "en"],
    acceptLanguage: "zh-TW,zh;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "taipei"
  },
  {
    locale: "en-SG",
    label: "English (Singapore)",
    intlLocale: "en-SG",
    languages: ["en-SG", "en-US", "en"],
    acceptLanguage: "en-SG,en-US;q=0.9,en;q=0.8",
    defaultLocationId: "singapore"
  },
  {
    locale: "ms-MY",
    label: "Bahasa Melayu (Malaysia)",
    intlLocale: "ms-MY",
    languages: ["ms-MY", "ms", "en-US", "en"],
    acceptLanguage: "ms-MY,ms;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "kuala-lumpur"
  },
  {
    locale: "th-TH",
    label: "ไทย (ไทย)",
    intlLocale: "th-TH",
    languages: ["th-TH", "th", "en-US", "en"],
    acceptLanguage: "th-TH,th;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "bangkok"
  },
  {
    locale: "vi-VN",
    label: "Tiếng Việt (Việt Nam)",
    intlLocale: "vi-VN",
    languages: ["vi-VN", "vi", "en-US", "en"],
    acceptLanguage: "vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "ho-chi-minh-city"
  },
  {
    locale: "id-ID",
    label: "Bahasa Indonesia (Indonesia)",
    intlLocale: "id-ID",
    languages: ["id-ID", "id", "en-US", "en"],
    acceptLanguage: "id-ID,id;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "jakarta"
  },
  {
    locale: "en-AU",
    label: "English (Australia)",
    intlLocale: "en-AU",
    languages: ["en-AU", "en-GB", "en"],
    acceptLanguage: "en-AU,en-GB;q=0.9,en;q=0.8",
    defaultLocationId: "sydney"
  },
  {
    locale: "en-IN",
    label: "English (India)",
    intlLocale: "en-IN",
    languages: ["en-IN", "en-GB", "en"],
    acceptLanguage: "en-IN,en-GB;q=0.9,en;q=0.8",
    defaultLocationId: "mumbai"
  },
  {
    locale: "ar-SA",
    label: "العربية (السعودية)",
    intlLocale: "ar-SA",
    languages: ["ar-SA", "ar", "en-US", "en"],
    acceptLanguage: "ar-SA,ar;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "riyadh"
  },
  {
    locale: "tr-TR",
    label: "Türkçe (Türkiye)",
    intlLocale: "tr-TR",
    languages: ["tr-TR", "tr", "en-US", "en"],
    acceptLanguage: "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "istanbul"
  },
  {
    locale: "ru-RU",
    label: "Русский (Россия)",
    intlLocale: "ru-RU",
    languages: ["ru-RU", "ru", "en-US", "en"],
    acceptLanguage: "ru-RU,ru;q=0.9,en-US;q=0.7,en;q=0.6",
    defaultLocationId: "moscow"
  }
];

export const LOCATION_PRESETS: LocationPreset[] = [
  {
    id: "los-angeles",
    label: "Los Angeles",
    city: "Los Angeles",
    country: "United States",
    timezoneId: "America/Los_Angeles",
    locale: "en-US",
    latitude: 34.0522,
    longitude: -118.2437,
    accuracy: 80
  },
  {
    id: "new-york",
    label: "New York",
    city: "New York",
    country: "United States",
    timezoneId: "America/New_York",
    locale: "en-US",
    latitude: 40.7128,
    longitude: -74.006,
    accuracy: 65
  },
  {
    id: "toronto",
    label: "Toronto",
    city: "Toronto",
    country: "Canada",
    timezoneId: "America/Toronto",
    locale: "en-CA",
    latitude: 43.6532,
    longitude: -79.3832,
    accuracy: 70
  },
  {
    id: "london",
    label: "London",
    city: "London",
    country: "United Kingdom",
    timezoneId: "Europe/London",
    locale: "en-GB",
    latitude: 51.5072,
    longitude: -0.1276,
    accuracy: 70
  },
  {
    id: "paris",
    label: "Paris",
    city: "Paris",
    country: "France",
    timezoneId: "Europe/Paris",
    locale: "fr-FR",
    latitude: 48.8566,
    longitude: 2.3522,
    accuracy: 70
  },
  {
    id: "berlin",
    label: "Berlin",
    city: "Berlin",
    country: "Germany",
    timezoneId: "Europe/Berlin",
    locale: "de-DE",
    latitude: 52.52,
    longitude: 13.405,
    accuracy: 75
  },
  {
    id: "madrid",
    label: "Madrid",
    city: "Madrid",
    country: "Spain",
    timezoneId: "Europe/Madrid",
    locale: "es-ES",
    latitude: 40.4168,
    longitude: -3.7038,
    accuracy: 75
  },
  {
    id: "rome",
    label: "Rome",
    city: "Rome",
    country: "Italy",
    timezoneId: "Europe/Rome",
    locale: "it-IT",
    latitude: 41.9028,
    longitude: 12.4964,
    accuracy: 75
  },
  {
    id: "amsterdam",
    label: "Amsterdam",
    city: "Amsterdam",
    country: "Netherlands",
    timezoneId: "Europe/Amsterdam",
    locale: "nl-NL",
    latitude: 52.3676,
    longitude: 4.9041,
    accuracy: 70
  },
  {
    id: "stockholm",
    label: "Stockholm",
    city: "Stockholm",
    country: "Sweden",
    timezoneId: "Europe/Stockholm",
    locale: "sv-SE",
    latitude: 59.3293,
    longitude: 18.0686,
    accuracy: 75
  },
  {
    id: "warsaw",
    label: "Warsaw",
    city: "Warsaw",
    country: "Poland",
    timezoneId: "Europe/Warsaw",
    locale: "pl-PL",
    latitude: 52.2297,
    longitude: 21.0122,
    accuracy: 75
  },
  {
    id: "sao-paulo",
    label: "Sao Paulo",
    city: "Sao Paulo",
    country: "Brazil",
    timezoneId: "America/Sao_Paulo",
    locale: "pt-BR",
    latitude: -23.5558,
    longitude: -46.6396,
    accuracy: 80
  },
  {
    id: "mexico-city",
    label: "Mexico City",
    city: "Mexico City",
    country: "Mexico",
    timezoneId: "America/Mexico_City",
    locale: "es-MX",
    latitude: 19.4326,
    longitude: -99.1332,
    accuracy: 80
  },
  {
    id: "tokyo",
    label: "Tokyo",
    city: "Tokyo",
    country: "Japan",
    timezoneId: "Asia/Tokyo",
    locale: "ja-JP",
    latitude: 35.6762,
    longitude: 139.6503,
    accuracy: 85
  },
  {
    id: "seoul",
    label: "Seoul",
    city: "Seoul",
    country: "South Korea",
    timezoneId: "Asia/Seoul",
    locale: "ko-KR",
    latitude: 37.5665,
    longitude: 126.978,
    accuracy: 85
  },
  {
    id: "beijing",
    label: "Beijing",
    city: "Beijing",
    country: "China",
    timezoneId: "Asia/Shanghai",
    locale: "zh-CN",
    latitude: 39.9042,
    longitude: 116.4074,
    accuracy: 90
  },
  {
    id: "taipei",
    label: "Taipei",
    city: "Taipei",
    country: "Taiwan",
    timezoneId: "Asia/Taipei",
    locale: "zh-TW",
    latitude: 25.033,
    longitude: 121.5654,
    accuracy: 85
  },
  {
    id: "singapore",
    label: "Singapore",
    city: "Singapore",
    country: "Singapore",
    timezoneId: "Asia/Singapore",
    locale: "en-SG",
    latitude: 1.3521,
    longitude: 103.8198,
    accuracy: 60
  },
  {
    id: "kuala-lumpur",
    label: "Kuala Lumpur",
    city: "Kuala Lumpur",
    country: "Malaysia",
    timezoneId: "Asia/Kuala_Lumpur",
    locale: "ms-MY",
    latitude: 3.139,
    longitude: 101.6869,
    accuracy: 70
  },
  {
    id: "bangkok",
    label: "Bangkok",
    city: "Bangkok",
    country: "Thailand",
    timezoneId: "Asia/Bangkok",
    locale: "th-TH",
    latitude: 13.7563,
    longitude: 100.5018,
    accuracy: 80
  },
  {
    id: "ho-chi-minh-city",
    label: "Ho Chi Minh City",
    city: "Ho Chi Minh City",
    country: "Vietnam",
    timezoneId: "Asia/Saigon",
    locale: "vi-VN",
    latitude: 10.8231,
    longitude: 106.6297,
    accuracy: 80
  },
  {
    id: "jakarta",
    label: "Jakarta",
    city: "Jakarta",
    country: "Indonesia",
    timezoneId: "Asia/Jakarta",
    locale: "id-ID",
    latitude: -6.2088,
    longitude: 106.8456,
    accuracy: 85
  },
  {
    id: "sydney",
    label: "Sydney",
    city: "Sydney",
    country: "Australia",
    timezoneId: "Australia/Sydney",
    locale: "en-AU",
    latitude: -33.8688,
    longitude: 151.2093,
    accuracy: 70
  },
  {
    id: "mumbai",
    label: "Mumbai",
    city: "Mumbai",
    country: "India",
    timezoneId: "Asia/Calcutta",
    locale: "en-IN",
    latitude: 19.076,
    longitude: 72.8777,
    accuracy: 85
  },
  {
    id: "riyadh",
    label: "Riyadh",
    city: "Riyadh",
    country: "Saudi Arabia",
    timezoneId: "Asia/Riyadh",
    locale: "ar-SA",
    latitude: 24.7136,
    longitude: 46.6753,
    accuracy: 85
  },
  {
    id: "istanbul",
    label: "Istanbul",
    city: "Istanbul",
    country: "Türkiye",
    timezoneId: "Europe/Istanbul",
    locale: "tr-TR",
    latitude: 41.0082,
    longitude: 28.9784,
    accuracy: 80
  },
  {
    id: "moscow",
    label: "Moscow",
    city: "Moscow",
    country: "Russia",
    timezoneId: "Europe/Moscow",
    locale: "ru-RU",
    latitude: 55.7558,
    longitude: 37.6173,
    accuracy: 85
  }
];

export const PLATFORM_OPTIONS: PlatformOption[] = [
  { value: "Win32", label: "Windows" },
  { value: "MacIntel", label: "macOS" },
  { value: "Linux x86_64", label: "Linux" }
];

export function localePresetFor(locale: string): LocalePreset | undefined {
  return LOCALE_PRESETS.find((preset) => preset.locale === locale);
}

export function locationPresetFor(locationId: string): LocationPreset | undefined {
  return LOCATION_PRESETS.find((preset) => preset.id === locationId);
}

export function locationPresetForTimezone(timezoneId: string): LocationPreset | undefined {
  return LOCATION_PRESETS.find((preset) => preset.timezoneId === timezoneId);
}

export function supportedTimezones(): string[] {
  const values = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set([...values, ...FALLBACK_TIMEZONES])].sort((left, right) => left.localeCompare(right));
}

export function normalizeTimezoneId(timezoneId: string): string {
  const candidates = [
    timezoneId,
    canonicalTimezoneId(timezoneId),
    ...(TIMEZONE_ALIASES[timezoneId] ?? [])
  ].filter((entry): entry is string => Boolean(entry));
  return candidates.find((entry) => SUPPORTED_TIMEZONE_SET.has(entry)) ?? DEFAULT_TIMEZONE;
}

function canonicalTimezoneId(timezoneId: string): string | undefined {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timezoneId }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function timezoneRegion(timezoneId: string): string {
  const separator = timezoneId.indexOf("/");
  return separator > 0 ? timezoneId.slice(0, separator) : "Other";
}

export function timezoneRegions(currentTimezoneId: string): string[] {
  return [...new Set([...TIMEZONE_REGIONS, timezoneRegion(currentTimezoneId)])].sort((left, right) => left.localeCompare(right));
}

export function timezonesForRegion(region: string, currentTimezoneId: string): string[] {
  const timezones = SUPPORTED_TIMEZONES.filter((timezoneId) => timezoneRegion(timezoneId) === region);
  if (timezoneRegion(currentTimezoneId) === region && !timezones.includes(currentTimezoneId)) {
    timezones.push(currentTimezoneId);
  }
  return timezones.sort((left, right) => left.localeCompare(right));
}

export function timezoneLabel(timezoneId: string): string {
  const separator = timezoneId.indexOf("/");
  return separator > 0 ? timezoneId.slice(separator + 1).replaceAll("_", " ") : timezoneId;
}

export function applyLocalePreset(profile: Profile, locale: string): Profile {
  const preset = localePresetFor(locale);
  if (!preset) {
    return profile;
  }
  const location = locationPresetFor(preset.defaultLocationId);
  return applyLocationPreset({
    ...profile,
    locale: preset.locale,
    intlLocale: preset.intlLocale,
    languages: [...preset.languages],
    acceptLanguage: preset.acceptLanguage
  }, location?.id ?? "");
}

export function applyLocationPreset(profile: Profile, locationId: string): Profile {
  const location = locationPresetFor(locationId);
  if (!location) {
    return profile;
  }
  return {
    ...profile,
    timezoneId: location.timezoneId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy
  };
}
