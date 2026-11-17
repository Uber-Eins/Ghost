import type { Profile } from "./types";

export type KeyboardLayout = [code: string, key: string][];

// Unshifted Windows mappings: microsoft/vscode's keyboardLayouts/{en,en-uk,
// de,fr}.win.ts (MIT). Only Chromium's kWritingSystemKeyDomCodes are included.
// JIS: xkeyboard-config symbols/jp(common,106), with Chromium's Windows
// IntlYen and Backquote corrections (dom_keyboard_layout_map_win.cc).
const US: Record<string, string> = {
  ...Object.fromEntries(Array.from("abcdefghijklmnopqrstuvwxyz", (key) => [`Key${key.toUpperCase()}`, key])),
  ...Object.fromEntries(Array.from("1234567890", (key) => [`Digit${key}`, key])),
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", IntlBackslash: "\\"
};
const UK = { ...US, Backquote: "`", Backslash: "#" };
const GERMAN = {
  ...US, KeyY: "z", KeyZ: "y", Minus: "ß", Equal: "´", BracketLeft: "ü", BracketRight: "+",
  Backslash: "#", Semicolon: "ö", Quote: "ä", Backquote: "^", Slash: "-", IntlBackslash: "<"
};
const FRENCH = {
  ...US, KeyQ: "a", KeyA: "q", KeyW: "z", KeyZ: "w", KeyM: ",",
  Digit1: "&", Digit2: "é", Digit3: '"', Digit4: "'", Digit5: "(", Digit6: "-", Digit7: "è",
  Digit8: "_", Digit9: "ç", Digit0: "à", Minus: ")", Equal: "=", BracketLeft: "^", BracketRight: "$",
  Backslash: "*", Semicolon: "m", Quote: "ù", Backquote: "²", Comma: ";", Period: ":", Slash: "!", IntlBackslash: "<"
};
const { IntlBackslash: _unused, ...JIS_BASE } = US;
const JAPANESE = {
  ...JIS_BASE, Backquote: "半角/全角", Equal: "^", BracketLeft: "@", BracketRight: "[",
  Backslash: "]", Quote: ":", IntlRo: "\\", IntlYen: "¥"
};

export function keyboardLayoutForProfile(profile: Pick<Profile, "locale">): KeyboardLayout {
  const locale = profile.locale.toLowerCase();
  const layout = locale === "en-gb" ? UK
    : locale === "de" || locale.startsWith("de-") ? GERMAN
      : locale === "fr-fr" ? FRENCH
        : locale === "ja-jp" ? JAPANESE : US;
  // This is a deterministic data order, not Blink's HashMap iteration order.
  // The page patch retains the native map's order for shared codes.
  return Object.entries(layout).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}
