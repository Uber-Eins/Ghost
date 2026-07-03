import { runtimeUserAgent, uaPlatformForProfile, userAgentForProfile, userAgentMetadataForProfile } from "../shared/profiles";
import type { Profile } from "../shared/types";

const PROTOCOL_VERSION = "1.3";

type Debuggee = chrome.debugger.Debuggee;

export interface AdvancedResult {
  attempted: boolean;
  applied: boolean;
  error?: string;
}

export async function applyAdvancedOverrides(tabId: number, profile: Profile): Promise<AdvancedResult> {
  if (!chrome.debugger) {
    return { attempted: false, applied: false };
  }

  const target: Debuggee = { tabId };
  const nativeUserAgent = runtimeUserAgent();
  try {
    await attachIfNeeded(target);
    await sendCommand(target, "Emulation.setGeolocationOverride", {
      latitude: profile.latitude,
      longitude: profile.longitude,
      accuracy: profile.accuracy
    });
    await sendCommand(target, "Emulation.setTimezoneOverride", { timezoneId: profile.timezoneId });
    await sendCommand(target, "Emulation.setLocaleOverride", { locale: profile.intlLocale || profile.locale });
    await sendCommand(target, "Emulation.setUserAgentOverride", {
      userAgent: userAgentForProfile(profile, nativeUserAgent),
      acceptLanguage: profile.acceptLanguage,
      platform: uaPlatformForProfile(profile),
      userAgentMetadata: userAgentMetadataForProfile(profile, nativeUserAgent)
    });
    return { attempted: true, applied: true };
  } catch (error) {
    return {
      attempted: true,
      applied: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function clearAdvancedOverrides(tabId: number): Promise<void> {
  if (!chrome.debugger) {
    return;
  }

  const target: Debuggee = { tabId };
  try {
    await sendCommand(target, "Emulation.clearGeolocationOverride");
    await sendCommand(target, "Emulation.setTimezoneOverride", { timezoneId: "" });
    await sendCommand(target, "Emulation.setLocaleOverride", { locale: "" });
    await chrome.debugger.detach(target);
  } catch {
    // The target may not be attached or may have navigated away.
  }
}

async function attachIfNeeded(target: Debuggee): Promise<void> {
  try {
    await chrome.debugger.attach(target, PROTOCOL_VERSION);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Another debugger is already attached|Cannot access|already attached/i.test(message)) {
      throw error;
    }
    if (/Another debugger is already attached|Cannot access/i.test(message)) {
      throw error;
    }
  }
}

function sendCommand(target: Debuggee, method: string, commandParams?: object): Promise<unknown> {
  return chrome.debugger.sendCommand(target, method, commandParams);
}
