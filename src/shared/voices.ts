import type { Profile } from "./types";

export interface ProfileVoice {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
  default: boolean;
}

// Windows OneCore voices, not the Narrator-only natural or Edge online voices.
// Names: Microsoft Support's "Appendix A: Supported languages and voices",
// https://github.com/readium/speech/tree/main/json and the observed Windows
// getVoices() dump in https://qiita.com/7shi/items/7f98e144cb69234c5e0e .
// Chromium reads OneCore token descriptions (content/browser/speech/tts_win.cc)
// in registry order and marks the first voice as default
// (speech_synthesis_impl.cc), so names here are kept alphabetical.
const WINDOWS_VOICES: Record<string, { region: string; names: string[] }> = {
  "en-US": { region: "English (United States)", names: ["David", "Mark", "Zira"] },
  "en-GB": { region: "English (United Kingdom)", names: ["George", "Hazel", "Susan"] },
  "en-CA": { region: "English (Canada)", names: ["Linda", "Richard"] },
  "en-AU": { region: "English (Australia)", names: ["Catherine", "James"] },
  "en-IN": { region: "English (India)", names: ["Heera", "Ravi"] },
  "fr-FR": { region: "French (France)", names: ["Hortense", "Julie", "Paul"] },
  "de-DE": { region: "German (Germany)", names: ["Hedda", "Katja", "Stefan"] },
  "es-ES": { region: "Spanish (Spain)", names: ["Helena", "Laura", "Pablo"] },
  "es-MX": { region: "Spanish (Mexico)", names: ["Raul", "Sabina"] },
  "it-IT": { region: "Italian (Italy)", names: ["Cosimo", "Elsa"] },
  "nl-NL": { region: "Dutch (Netherlands)", names: ["Frank"] },
  "sv-SE": { region: "Swedish", names: ["Bengt"] },
  "pl-PL": { region: "Polish (Poland)", names: ["Adam", "Paulina"] },
  "pt-BR": { region: "Portuguese (Brazil)", names: ["Daniel", "Maria"] },
  "ja-JP": { region: "Japanese (Japan)", names: ["Ayumi", "Haruka", "Ichiro", "Sayaka"] },
  "ko-KR": { region: "Korean (Korean)", names: ["Heami"] },
  "zh-CN": { region: "Chinese (Simplified, PRC)", names: ["Huihui", "Kangkang", "Yaoyao"] },
  "zh-TW": { region: "Chinese (Traditional, Taiwan)", names: ["Hanhan", "Yating", "Zhiwei"] },
  "ms-MY": { region: "Malay (Malaysia)", names: ["Rizwan"] },
  "th-TH": { region: "Thai (Thailand)", names: ["Pattara"] },
  "vi-VN": { region: "Vietnamese (Vietnam)", names: ["An"] },
  "id-ID": { region: "Indonesian (Indonesia)", names: ["Andika"] },
  "ru-RU": { region: "Russian (Russia)", names: ["Irina", "Pavel"] },
  "tr-TR": { region: "Turkish (Turkey)", names: ["Tolga"] },
  "hi-IN": { region: "Hindi (India)", names: ["Hemant", "Kalpana"] },
  "ar-SA": { region: "Arabic (Saudi Arabia)", names: ["Naayf"] }
};

// These regions have no Windows local pack of their own; never relabel a
// voice's language to make it look like a pack that Microsoft does not ship.
const REGIONAL_FALLBACKS: Record<string, string> = { "en-SG": "en-US", "es-US": "es-MX" };

function voiceLocale(locale: string): string | undefined {
  const exact = Object.keys(WINDOWS_VOICES).find((key) => key.toLowerCase() === locale.toLowerCase());
  return exact ?? Object.entries(REGIONAL_FALLBACKS).find(([key]) => key.toLowerCase() === locale.toLowerCase())?.[1];
}

export function voicesForProfile(profile: Pick<Profile, "locale" | "languages">, reportedPlatform: string): ProfileVoice[] {
  if (!/^Win/i.test(reportedPlatform)) {
    return [];
  }
  const primary = voiceLocale(profile.locale);
  if (!primary) {
    return [];
  }
  const locales = new Set([primary]);
  for (const language of profile.languages) {
    if (language.includes("-")) {
      const locale = voiceLocale(language);
      if (locale) locales.add(locale);
    }
  }
  const voices = [...locales].flatMap((lang) => WINDOWS_VOICES[lang].names.map((voice) => {
    const name = `Microsoft ${voice} - ${WINDOWS_VOICES[lang].region}`;
    return { name, lang, voiceURI: name, localService: true, default: false };
  }));
  // The system default voice comes first; the rest follow registry order,
  // which groups by language and then sorts by voice name.
  const [defaultVoice, ...rest] = voices;
  rest.sort((left, right) => left.lang.localeCompare(right.lang, "en") || left.name.localeCompare(right.name, "en"));
  return [{ ...defaultVoice, default: true }, ...rest];
}
