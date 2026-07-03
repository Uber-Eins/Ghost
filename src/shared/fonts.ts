import type { Profile } from "./types";

const CJK_LOCALE_PREFIXES = ["zh", "ja", "ko"];
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "emoji",
  "math",
  "fangsong"
]);

const WINDOWS_CORE_FONTS = [
  "arial",
  "arial black",
  "bahnschrift",
  "calibri",
  "cambria",
  "cambria math",
  "candara",
  "comic sans ms",
  "consolas",
  "constantia",
  "corbel",
  "courier new",
  "franklin gothic medium",
  "gabriola",
  "gadugi",
  "georgia",
  "impact",
  "ink free",
  "lucida console",
  "lucida sans unicode",
  "microsoft sans serif",
  "palatino linotype",
  "segoe print",
  "segoe script",
  "segoe ui",
  "segoe ui emoji",
  "segoe ui historic",
  "segoe ui symbol",
  "sylfaen",
  "tahoma",
  "times new roman",
  "trebuchet ms",
  "verdana",
  "webdings",
  "wingdings"
];

const ZH_CN_PROFILE_FONTS = [
  "dengxian",
  "fangsong",
  "kaiti",
  "microsoft yahei",
  "microsoft yahei ui",
  "nsimsun",
  "simhei",
  "simsun"
];

const JA_JP_PROFILE_FONTS = [
  "meiryo",
  "meiryo ui",
  "yu gothic",
  "yu gothic ui",
  "yu mincho"
];

const KO_KR_PROFILE_FONTS = [
  "malgun gothic",
  "batang",
  "dotum",
  "gulim"
];

export function profileAllowsCjkFonts(profile: Profile): boolean {
  const locale = profileLocale(profile);
  return CJK_LOCALE_PREFIXES.some((prefix) => locale === prefix || locale.startsWith(`${prefix}-`));
}

export function canvasFontHasBlockedFamily(font: string, profile: Profile, loadedFamilies: Iterable<string> = []): boolean {
  return extractCanvasFontFamilies(font).some((family) => !profileAllowsFontFamily(family, profile, loadedFamilies));
}

export function sanitizeCanvasFont(font: string, profile: Profile, loadedFamilies: Iterable<string> = []): string {
  const split = splitCanvasFont(font);
  if (!split) {
    return font;
  }

  const families = splitCssFamilyList(split.families);
  const filtered = families.filter((family) => profileAllowsFontFamily(family, profile, loadedFamilies));
  if (filtered.length === families.length) {
    return font;
  }

  return `${split.prefix}${filtered.length > 0 ? filtered.join(", ") : "sans-serif"}`;
}

export function extractCanvasFontFamilies(font: string): string[] {
  const split = splitCanvasFont(font);
  return split ? splitCssFamilyList(split.families) : [];
}

export function profileAllowsFontFamily(family: string, profile: Profile, loadedFamilies: Iterable<string> = []): boolean {
  const normalized = normalizeFontFamily(family);
  if (!normalized || GENERIC_FAMILIES.has(normalized)) {
    return true;
  }
  if (normalizedSet(loadedFamilies).has(normalized)) {
    return true;
  }
  return profileFontSet(profile).has(normalized);
}

export function normalizeFontFamily(family: string): string {
  return unquoteCssString(family)
    .replace(/\\([\s\S])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function profileFontSet(profile: Profile): Set<string> {
  const locale = profileLocale(profile);
  const fonts = new Set(WINDOWS_CORE_FONTS);
  if (locale === "zh" || locale.startsWith("zh-")) {
    addAll(fonts, ZH_CN_PROFILE_FONTS);
  } else if (locale === "ja" || locale.startsWith("ja-")) {
    addAll(fonts, JA_JP_PROFILE_FONTS);
  } else if (locale === "ko" || locale.startsWith("ko-")) {
    addAll(fonts, KO_KR_PROFILE_FONTS);
  }
  return fonts;
}

function profileLocale(profile: Profile): string {
  return (profile.locale || profile.intlLocale).toLowerCase();
}

function addAll(target: Set<string>, values: string[]): void {
  for (const value of values) {
    target.add(value);
  }
}

function normalizedSet(values: Iterable<string>): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    result.add(normalizeFontFamily(value));
  }
  return result;
}

function splitCanvasFont(font: string): { prefix: string; families: string } | null {
  const match = /(?:^|\s)(?:\d+(?:\.\d+)?(?:px|pt|pc|in|cm|mm|q|em|rem|ex|ch|lh|rlh|vw|vh|vmin|vmax|%|cap|ic))(?:\s*\/\s*[^,\s]+)?\s+/i.exec(font);
  if (!match) {
    return null;
  }
  const familiesStart = match.index + match[0].length;
  return {
    prefix: font.slice(0, familiesStart),
    families: font.slice(familiesStart)
  };
}

function splitCssFamilyList(value: string): string[] {
  const families: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaping = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      current += char;
      quote = char;
      continue;
    }
    if (char === ",") {
      pushFamily(families, current);
      current = "";
      continue;
    }
    current += char;
  }
  pushFamily(families, current);
  return families;
}

function pushFamily(families: string[], family: string): void {
  const trimmed = family.trim();
  if (trimmed) {
    families.push(trimmed);
  }
}

function unquoteCssString(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
