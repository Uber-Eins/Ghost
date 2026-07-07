import { applyAdvancedOverrides, clearAdvancedOverrides } from "./advanced";
import { refreshHeaderRules } from "./dnr";
import { stableSeed } from "../shared/hash";
import { isSupportedPageUrl, unsupportedPageLabel } from "../shared/internal";
import { findProfile } from "../shared/profiles";
import { isExcluded, siteKeyFromUrl } from "../shared/site";
import {
  DEFAULT_SETTINGS,
  ensureSiteAssignment,
  loadSettings,
  normalizeSettings,
  profilesFromSettings,
  resolveProfile,
  saveSettings,
  updateSettings
} from "../shared/storage";
import type { BuildTarget, GhostSettings, PopupState, RuntimeRequest, RuntimeResponse } from "../shared/types";

declare const __GHOST_BUILD__: BuildTarget;

chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});

chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse: (response: RuntimeResponse) => void) => {
  void handleMessage(message, sender)
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

async function initialize(): Promise<void> {
  const settings = await loadSettings();
  await saveSettings(settings);
  await refreshHeaderRules(settings);
}

async function handleMessage(message: RuntimeRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "resolveProfile":
      return handleResolveProfile(message.url, sender);
    case "getPopupState":
      return getPopupState(message.url);
    case "setGlobalEnabled":
      return mutateAndRefresh((settings) => {
        settings.enabled = message.enabled;
      });
    case "setSiteEnabled":
      return mutateAndRefresh((settings) => {
        settings.excludedDomains = message.enabled
          ? settings.excludedDomains.filter((domain) => domain !== message.siteKey)
          : [...new Set([...settings.excludedDomains, message.siteKey])];
      });
    case "setSiteProfile":
      return mutateAndRefresh((settings) => {
        settings.siteProfiles[message.siteKey] = message.profileId;
      });
    case "regenerateSiteProfile":
      return mutateAndRefresh((settings) => {
        const profiles = profilesFromSettings(settings);
        const oldProfileId = settings.siteProfiles[message.siteKey];
        let nonce = (settings.siteNonces[message.siteKey] ?? 0) + 1;
        let nextProfileId = profiles[0]?.id ?? "";
        for (let attempt = 0; attempt < profiles.length + 1; attempt += 1) {
          settings.siteNonces[message.siteKey] = nonce;
          nextProfileId = ensureSiteAssignment({ ...settings, siteProfiles: {} }, message.siteKey);
          if (nextProfileId !== oldProfileId || profiles.length <= 1) {
            break;
          }
          nonce += 1;
        }
        settings.siteNonces[message.siteKey] = nonce;
        settings.siteProfiles[message.siteKey] = nextProfileId;
      });
    case "setTemporaryDisable":
      return mutateAndRefresh((settings) => {
        settings.temporaryDisabledUntil = message.durationMs > 0 ? Date.now() + message.durationMs : null;
      });
    case "options.getState":
      return loadSettings();
    case "options.saveState":
      return mutateAndRefresh((settings) => {
        const normalized = normalizeSettings(message.settings);
        Object.assign(settings, normalized);
      });
    case "options.resetState":
      await saveSettings(DEFAULT_SETTINGS);
      await refreshHeaderRules(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    default:
      return assertNever(message);
  }
}

async function handleResolveProfile(url: string, sender: chrome.runtime.MessageSender) {
  if (!isSupportedPageUrl(url)) {
    const settings = await loadSettings();
    const profile = findProfile(undefined, settings.customProfiles, settings.hiddenPresetProfileIds);
    return {
      build: __GHOST_BUILD__,
      enabled: false,
      reason: "unsupported-url",
      siteKey: unsupportedPageLabel(url),
      seed: stableSeed("", profile.id),
      profile,
      advanced: {
        available: __GHOST_BUILD__ === "advanced",
        attempted: false,
        applied: false
      }
    };
  }

  const settings = await updateSettings((state) => {
    ensureSiteAssignment(state, siteKeyFromUrl(url));
  });
  const resolved = resolveProfile(url, settings, __GHOST_BUILD__);

  if (resolved.enabled) {
    await refreshHeaderRules(settings);
    if (__GHOST_BUILD__ === "advanced" && settings.advancedEnabled && shouldApplyTabWideOverrides(sender)) {
      const advanced = await applyAdvancedOverrides(sender.tab.id, resolved.profile);
      resolved.advanced = {
        available: true,
        attempted: advanced.attempted,
        applied: advanced.applied,
        error: advanced.error
      };
    }
  } else if (shouldApplyTabWideOverrides(sender)) {
    await clearAdvancedOverrides(sender.tab.id);
  }

  return resolved;
}

function shouldApplyTabWideOverrides(sender: chrome.runtime.MessageSender): sender is chrome.runtime.MessageSender & { tab: chrome.tabs.Tab & { id: number } } {
  return sender.frameId === 0 && typeof sender.tab?.id === "number";
}

async function getPopupState(url: string): Promise<PopupState> {
  if (!isSupportedPageUrl(url)) {
    const settings = await loadSettings();
    const profile = findProfile(undefined, settings.customProfiles, settings.hiddenPresetProfileIds);
    return {
      build: __GHOST_BUILD__,
      settings,
      siteKey: unsupportedPageLabel(url),
      supportedPage: false,
      enabledForSite: false,
      profile,
      profiles: profilesFromSettings(settings),
      advancedAvailable: __GHOST_BUILD__ === "advanced"
    };
  }

  const settings = await updateSettings((state) => {
    ensureSiteAssignment(state, siteKeyFromUrl(url));
  });
  const siteKey = siteKeyFromUrl(url);
  const profileId = settings.siteProfiles[siteKey];
  const profile = findProfile(profileId, settings.customProfiles, settings.hiddenPresetProfileIds);
  return {
    build: __GHOST_BUILD__,
    settings,
    siteKey,
    supportedPage: true,
    enabledForSite: settings.enabled && !isExcluded(siteKey, settings.excludedDomains),
    profile,
    profiles: profilesFromSettings(settings),
    advancedAvailable: __GHOST_BUILD__ === "advanced"
  };
}

async function mutateAndRefresh(mutator: (settings: GhostSettings) => void): Promise<GhostSettings> {
  const settings = await updateSettings(mutator);
  await refreshHeaderRules(settings);
  return settings;
}

function assertNever(value: never): never {
  throw new Error(`Unknown message: ${JSON.stringify(value)}`);
}
