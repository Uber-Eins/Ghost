import { stableIndex } from "./hash";
import { normalizedPlatformVersionOverride, userAgentMetadataForProfile } from "./profiles";
import type { Profile } from "./types";

export interface ProfileScreen {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  availLeft: number;
  availTop: number;
}

// Desktop CSS-pixel resolutions represented in StatCounter's public share data:
// https://gs.statcounter.com/screen-resolution-stats/desktop/worldwide
// This is a short plausibility list, not a claim about current market weights.
const RESOLUTIONS = [
  [1280, 720], [1366, 768], [1440, 900], [1536, 864], [1600, 900],
  [1920, 1080], [2560, 1440], [2560, 1600], [3840, 2160]
] as const;

export function screenForProfile(profile: Profile, reportedPlatform: string, outer: { width: number; height: number }): ProfileScreen | null {
  if (profile.uaMode === "native" || !/^Win/i.test(reportedPlatform)) return null;
  const platformVersion = normalizedPlatformVersionOverride(profile.platformVersion)
    ?? userAgentMetadataForProfile(profile)?.platformVersion ?? "10.0.0";
  // Unconfirmed default taskbar heights at 100% scaling: Windows 11 uses 48
  // CSS px, Windows 10 uses 40. Custom taskbar sizes/auto-hide are not modelled.
  const taskbar = Number(platformVersion.split(".")[0]) >= 13 ? 48 : 40;
  let [width, height]: readonly [number, number] = RESOLUTIONS[stableIndex(profile.id, RESOLUTIONS.length)];
  const fits = (size: readonly [number, number]): boolean => size[0] >= outer.width && size[1] - taskbar >= outer.height;
  if (!fits([width, height])) {
    // Entries are ordered by area; a resize past this choice changes the
    // reported screen only on the next document load (or a profile change).
    const fitting = RESOLUTIONS.find(fits);
    [width, height] = fitting ?? [Math.ceil(outer.width / 80) * 80, Math.ceil((outer.height + taskbar) / 80) * 80];
  }
  return { width, height, availWidth: width, availHeight: height - taskbar, availLeft: 0, availTop: 0 };
}

const DEVICE_FEATURE = /^device-(width|height|aspect-ratio)$/i;
const COMPARISONS: Record<string, (left: number, right: number) => boolean> = {
  "=": (left, right) => left === right,
  "<": (left, right) => left < right,
  "<=": (left, right) => left <= right,
  ">": (left, right) => left > right,
  ">=": (left, right) => left >= right
};

export function rewriteScreenMediaQuery(query: string, screen: Pick<ProfileScreen, "width" | "height">): string {
  const featureValue = (feature: string): number => feature.toLowerCase() === "device-width" ? screen.width
    : feature.toLowerCase() === "device-height" ? screen.height : screen.width / screen.height;
  const valueFor = (text: string, feature: string): number | null => {
    // Deliberately not a CSS length evaluator: other units stay native.
    const number = "(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
    const match = feature.toLowerCase() === "device-aspect-ratio"
      ? text.match(new RegExp(`^(${number})(?:\\s*/\\s*(${number}))?$`))
      : text.match(new RegExp(`^(${number})px$`, "i"));
    if (!match || (match[2] !== undefined && Number(match[2]) === 0)) return null;
    const value = Number(match[1]) / (match[2] === undefined ? 1 : Number(match[2]));
    return Number.isFinite(value) ? value : null;
  };
  return query.replace(/\(([^()]*)\)/g, (expression, body: string) => {
    let matches: boolean;
    const colon = body.trim().match(/^(?:(min|max)-)?(device-(?:width|height|aspect-ratio))\s*:\s*(.*?)$/i);
    if (colon) {
      const value = valueFor(colon[3], colon[2]);
      if (value === null) return expression;
      const operator = colon[1]?.toLowerCase() === "min" ? ">=" : colon[1]?.toLowerCase() === "max" ? "<=" : "=";
      matches = COMPARISONS[operator](featureValue(colon[2]), value);
    } else {
      const parts = body.trim().split(/\s*(<=|>=|<|>|=)\s*/);
      if (parts.length !== 3 && parts.length !== 5) return expression;
      const featureIndices = parts.flatMap((part, index) => index % 2 === 0 && DEVICE_FEATURE.test(part) ? [index] : []);
      if (featureIndices.length !== 1) return expression;
      const featureIndex = featureIndices[0];
      if (parts.length === 5 && (featureIndex !== 2
        || parts[1][0] !== parts[3][0] || parts[1] === "=" || parts[3] === "=")) return expression;
      const feature = parts[featureIndex];
      const values = parts.filter((_, index) => index % 2 === 0)
        .map((part) => part === feature ? featureValue(feature) : valueFor(part, feature));
      if (values.some((value) => value === null)) return expression;
      matches = COMPARISONS[parts[1]](values[0]!, values[1]!)
        && (parts.length === 3 || COMPARISONS[parts[3]](values[1]!, values[2]!));
    }
    // Resolution is positive independently of viewport size, even in a 0px
    // iframe. Let the browser retain query composition and MQL event behavior.
    return matches ? "(min-resolution: 0dppx)" : "(max-resolution: 0dppx)";
  });
}
