import { applyAdvancedOverrides, clearAdvancedOverrides } from "./advanced";
import type { AdvancedResult } from "./advanced";
import { isSynchronousContentBootstrapAvailable, refreshContentBootstrap } from "./bootstrap";
import { clearTabHeaderRule, clearTabHeaderRules, refreshHeaderRules, refreshTabHeaderRule, validateHeaderRules } from "./dnr";
import { stableSeed } from "../shared/hash";
import { isAccessiblePageUrl, isSupportedPageUrl, senderBoundPageUrl, unsupportedPageLabel } from "../shared/internal";
import { findProfile } from "../shared/profiles";
import { bestMatchingSiteRule, DEFAULT_SITE_RULE, exclusionsForSiteToggle, isExcludedUrl, normalizeSiteRuleKey, siteKeyFromUrl } from "../shared/site";
import {
  DEFAULT_SETTINGS,
  ensureSiteAssignment,
  headerRulesAllowed,
  normalizeSettings,
  profileIdForSiteKey,
  profilesFromSettings,
  readSettings,
  resolveProfile,
  updateSettings
} from "../shared/storage";
import type { BuildTarget, GhostSettings, PopupState, RuntimeRequest, RuntimeResponse } from "../shared/types";

declare const __GHOST_BUILD__: BuildTarget;
declare const __GHOST_CHANNEL__: string;

const ENABLED_ICON_PATHS = iconSet("enabled");
const DISABLED_ICON_PATHS = iconSet("disabled");
const TEMPORARY_DISABLE_EXPIRED_ALARM = "ghost-temporary-disable-expired";
const SUPPORTED_TAB_URL_PATTERNS = ["http://*/*", "https://*/*", "file:///*"];
let settingsRevision = 0;
let settingsRefreshRevision = 0;
let settingsRefreshQueue: Promise<void> = Promise.resolve();
let settingsApplicationQueue: Promise<void> = Promise.resolve();
const tabOverrideRevisions = new Map<number, number>();

chrome.runtime.onInstalled.addListener(() => {
  runBackgroundTask(initialize());
});

chrome.runtime.onStartup.addListener(() => {
  runBackgroundTask(initialize());
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === TEMPORARY_DISABLE_EXPIRED_ALARM) {
    runBackgroundTask(handleTemporaryDisableExpired());
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  nextTabOverrideRevision(tabId);
  void Promise.allSettled([clearTabHeaderRule(tabId), clearAdvancedOverrides(tabId)]).finally(() => {
    tabOverrideRevisions.delete(tabId);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (typeof changeInfo.url !== "string") {
    return;
  }
  const revision = nextTabOverrideRevision(tabId);
  runBackgroundTask(refreshTabForNavigation(tabId, changeInfo.url, revision));
});

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse: (response: RuntimeResponse) => void) => {
  void handleMessage(message, sender)
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

function initialize(): Promise<void> {
  return enqueueSettingsApplication(initializeNow);
}

async function initializeNow(): Promise<void> {
  const settings = await updateSettings(async (draft) => {
    const normalized = normalizeSettings(draft);
    await validateHeaderRules(normalized);
    Object.assign(draft, normalized);
  });
  await refreshAfterSettingsChange(settings);
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
        const siteKey = normalizeSiteRuleKey(message.siteKey);
        if (!siteKey) {
          return;
        }
        settings.excludedDomains = exclusionsForSiteToggle(
          settings.excludedDomains,
          siteKey,
          message.url,
          message.enabled
        );
      });
    case "setSiteProfile":
      return mutateAndRefresh((settings) => {
        const siteKey = normalizeSiteRuleKey(message.siteKey);
        if (siteKey) {
          settings.siteProfiles[siteKey] = message.profileId;
        }
      });
    case "regenerateSiteProfile":
      return mutateAndRefresh((settings) => {
        const siteKey = normalizeSiteRuleKey(message.siteKey);
        if (!siteKey) {
          return;
        }
        const profiles = profilesFromSettings(settings);
        const inheritedRuleKey = bestMatchingSiteRule(siteKey, Object.keys(settings.siteProfiles)) ?? DEFAULT_SITE_RULE;
        const oldProfileId = inheritedRuleKey === DEFAULT_SITE_RULE && !settings.siteProfiles[siteKey]
          ? profileIdForSiteKey(siteKey, settings)
          : settings.siteProfiles[siteKey] ?? settings.siteProfiles[inheritedRuleKey];
        let nonce = (settings.siteNonces[siteKey] ?? 0) + 1;
        let nextProfileId = profiles[0]?.id ?? "";
        for (let attempt = 0; attempt < profiles.length + 1; attempt += 1) {
          settings.siteNonces[siteKey] = nonce;
          nextProfileId = ensureSiteAssignment({ ...settings, siteProfiles: {} }, siteKey);
          if (nextProfileId !== oldProfileId || profiles.length <= 1) {
            break;
          }
          nonce += 1;
        }
        settings.siteNonces[siteKey] = nonce;
        settings.siteProfiles[siteKey] = nextProfileId;
      });
    case "setTemporaryDisable":
      return mutateAndRefresh((settings) => {
        settings.temporaryDisabledUntil = message.durationMs > 0 ? Date.now() + message.durationMs : null;
      });
    case "options.getState":
      return readAppliedSettings();
    case "options.saveState":
      return mutateAndRefresh((settings) => {
        const normalized = normalizeSettings(message.settings);
        Object.assign(settings, normalized);
      });
    case "options.resetState":
      return mutateAndRefresh((settings) => {
        Object.assign(settings, normalizeSettings(DEFAULT_SETTINGS));
      });
    default:
      return assertNever(message);
  }
}

async function handleResolveProfile(url: string, sender: chrome.runtime.MessageSender) {
  const pageUrl = senderBoundPageUrl(url, sender.url ?? "", sender.origin, sender.tab?.url);
  const tabId = shouldApplyTabWideOverrides(sender) ? sender.tab.id : null;
  const tabRevision = tabId === null ? 0 : nextTabOverrideRevision(tabId);
  if (!pageUrl) {
    const settings = await readAppliedSettings();
    const profile = findProfile(undefined, settings.customProfiles, settings.hiddenPresetProfileIds);
    return {
      build: __GHOST_BUILD__,
      enabled: false,
      globalPrivacyControlEnabled: settings.globalPrivacyControlEnabled,
      uaSpoofingEnabled: false,
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

  const settings = await refreshExpiredTemporaryDisable(await readAppliedSettings());
  const revision = settingsRevision;
  const resolved = resolveProfile(pageUrl, settings, __GHOST_BUILD__);

  if (revision !== settingsRevision) {
    return resolveProfile(pageUrl, await readAppliedSettings(), __GHOST_BUILD__);
  }

  if (tabId !== null && tabRevision === currentTabOverrideRevision(tabId)) {
    await refreshTabHeaderRule(tabId, resolved, settings);
  }

  if (revision !== settingsRevision) {
    return resolveProfile(pageUrl, await readAppliedSettings(), __GHOST_BUILD__);
  }

  if (tabId !== null) {
    const advanced = await refreshAdvancedOverrideForTab(tabId, resolved, settings, tabRevision);
    if (advanced) {
      resolved.advanced = {
        available: true,
        attempted: advanced.attempted,
        applied: advanced.applied,
        error: advanced.error
      };
    }
  }

  if (revision !== settingsRevision) {
    return resolveProfile(pageUrl, await readAppliedSettings(), __GHOST_BUILD__);
  }

  return resolved;
}

function shouldApplyTabWideOverrides(sender: chrome.runtime.MessageSender): sender is chrome.runtime.MessageSender & { tab: chrome.tabs.Tab & { id: number } } {
  return sender.frameId === 0 && typeof sender.tab?.id === "number";
}

function nextTabOverrideRevision(tabId: number): number {
  const revision = (tabOverrideRevisions.get(tabId) ?? 0) + 1;
  tabOverrideRevisions.set(tabId, revision);
  return revision;
}

function currentTabOverrideRevision(tabId: number): number {
  return tabOverrideRevisions.get(tabId) ?? 0;
}

async function refreshAdvancedOverrideForTab(
  tabId: number,
  resolved: ReturnType<typeof resolveProfile>,
  settings: GhostSettings,
  tabRevision: number
): Promise<AdvancedResult | null> {
  if (__GHOST_BUILD__ !== "advanced" || tabRevision !== currentTabOverrideRevision(tabId)) {
    return null;
  }
  let result: AdvancedResult;
  if (resolved.enabled && settings.advancedEnabled) {
    result = await applyAdvancedOverrides(tabId, resolved.profile, {
      userAgent: resolved.uaSpoofingEnabled
    });
  } else {
    await clearAdvancedOverrides(tabId);
    result = { attempted: false, applied: false };
  }
  return tabRevision === currentTabOverrideRevision(tabId) ? result : null;
}

async function refreshTabForNavigation(tabId: number, url: string, tabRevision: number): Promise<void> {
  const supported = isAccessiblePageUrl(url, await pageSchemeAccessAllowed(url));
  if (tabRevision !== currentTabOverrideRevision(tabId)) {
    return;
  }
  await clearTabHeaderRule(tabId);
  if (__GHOST_BUILD__ === "advanced") {
    await clearAdvancedOverrides(tabId);
  }
  if (tabRevision !== currentTabOverrideRevision(tabId)) {
    return;
  }
  if (!supported) {
    return;
  }

  const settings = await readAppliedSettings();
  if (tabRevision !== currentTabOverrideRevision(tabId)) {
    return;
  }
  const resolved = resolveProfile(url, settings, __GHOST_BUILD__);
  await refreshTabHeaderRule(tabId, resolved, settings);
  await refreshAdvancedOverrideForTab(tabId, resolved, settings, tabRevision);
}

async function getPopupState(url: string): Promise<PopupState> {
  const settings = await refreshExpiredTemporaryDisable(await readAppliedSettings());
  const earlyBootstrapAvailable = await isSynchronousContentBootstrapAvailable();
  const protocolSupported = isSupportedPageUrl(url);
  const fileAccessRequired = protocolSupported && url.startsWith("file:") && !await pageSchemeAccessAllowed(url);
  if (!protocolSupported || fileAccessRequired) {
    const profile = protocolSupported
      ? resolveProfile(url, settings, __GHOST_BUILD__).profile
      : findProfile(undefined, settings.customProfiles, settings.hiddenPresetProfileIds);
    return {
      build: __GHOST_BUILD__,
      settings,
      url,
      siteKey: fileAccessRequired ? siteKeyFromUrl(url) : unsupportedPageLabel(url),
      supportedPage: false,
      fileAccessRequired,
      earlyBootstrapAvailable,
      enabledForSite: false,
      profile,
      profiles: profilesFromSettings(settings),
      advancedAvailable: __GHOST_BUILD__ === "advanced"
    };
  }

  const siteKey = siteKeyFromUrl(url);
  const resolved = resolveProfile(url, settings, __GHOST_BUILD__);
  return {
    build: __GHOST_BUILD__,
    settings,
    url,
    siteKey,
    supportedPage: true,
    fileAccessRequired: false,
    earlyBootstrapAvailable,
    enabledForSite: !isExcludedUrl(url, settings.excludedDomains),
    profile: resolved.profile,
    profiles: profilesFromSettings(settings),
    advancedAvailable: __GHOST_BUILD__ === "advanced"
  };
}

async function pageSchemeAccessAllowed(url: string): Promise<boolean> {
  if (!url.startsWith("file:")) {
    return true;
  }
  try {
    return await chrome.extension.isAllowedFileSchemeAccess();
  } catch {
    return false;
  }
}

function mutateAndRefresh(mutator: (settings: GhostSettings) => void): Promise<GhostSettings> {
  return enqueueSettingsApplication(() => mutateAndRefreshNow(mutator));
}

async function mutateAndRefreshNow(mutator: (settings: GhostSettings) => void): Promise<GhostSettings> {
  let previousSettings = normalizeSettings(DEFAULT_SETTINGS);
  const settings = await updateSettings(async (draft) => {
    previousSettings = normalizeSettings(draft);
    mutator(draft);
    const normalized = normalizeSettings(draft);
    await validateHeaderRules(normalized);
    Object.assign(draft, normalized);
  });
  settingsRevision += 1;
  const mutationRevision = settingsRevision;
  try {
    await refreshAfterSettingsChange(settings);
    return settings;
  } catch (error) {
    if (settingsRevision === mutationRevision) {
      const rolledBack = await updateSettings((draft) => {
        Object.assign(draft, previousSettings);
      });
      settingsRevision += 1;
      try {
        await refreshAfterSettingsChange(rolledBack);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Ghost failed to apply settings and to restore the previous runtime state.");
      }
    }
    throw error;
  }
}

function enqueueSettingsApplication<T>(operation: () => Promise<T>): Promise<T> {
  const pending = settingsApplicationQueue.then(operation, operation);
  settingsApplicationQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

async function readAppliedSettings(): Promise<GhostSettings> {
  await settingsApplicationQueue;
  return readSettings();
}

async function refreshExpiredTemporaryDisable(settings: GhostSettings): Promise<GhostSettings> {
  if (settings.temporaryDisabledUntil === null || settings.temporaryDisabledUntil > Date.now()) {
    return settings;
  }

  return mutateAndRefresh((draft) => {
    if (draft.temporaryDisabledUntil !== null && draft.temporaryDisabledUntil <= Date.now()) {
      draft.temporaryDisabledUntil = null;
    }
  });
}

async function refreshAfterSettingsChange(settings: GhostSettings): Promise<void> {
  settingsRefreshRevision += 1;
  const refreshRevision = settingsRefreshRevision;
  const pending = settingsRefreshQueue.then(
    () => refreshAfterSettingsChangeIfCurrent(settings, refreshRevision),
    () => refreshAfterSettingsChangeIfCurrent(settings, refreshRevision)
  );
  settingsRefreshQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

async function refreshAfterSettingsChangeIfCurrent(settings: GhostSettings, refreshRevision: number): Promise<void> {
  const steps: Array<() => Promise<void>> = [
    () => scheduleTemporaryDisableAlarm(settings),
    () => refreshContentBootstrap(settings, __GHOST_BUILD__),
    () => clearTabHeaderRules(),
    () => refreshHeaderRules(settings),
    () => refreshKnownTabOverrides(settings),
    () => refreshOpenPageProfiles(),
    () => updateActionIcon(settings)
  ];
  const errors: unknown[] = [];
  for (const step of steps) {
    if (refreshRevision !== settingsRefreshRevision) {
      return;
    }
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more Ghost runtime refreshes failed.");
  }
}

async function handleTemporaryDisableExpired(): Promise<void> {
  await refreshExpiredTemporaryDisable(await readAppliedSettings());
}

async function scheduleTemporaryDisableAlarm(settings: GhostSettings): Promise<void> {
  if (!chrome.alarms) {
    return;
  }
  await chrome.alarms.clear(TEMPORARY_DISABLE_EXPIRED_ALARM).catch(() => false);
  if (settings.temporaryDisabledUntil !== null && settings.temporaryDisabledUntil > Date.now()) {
    await chrome.alarms.create(TEMPORARY_DISABLE_EXPIRED_ALARM, {
      when: settings.temporaryDisabledUntil
    });
  }
}

async function refreshKnownTabOverrides(settings: GhostSettings): Promise<void> {
  if (!chrome.tabs?.query) {
    return;
  }
  const tabs = await chrome.tabs.query({ url: SUPPORTED_TAB_URL_PATTERNS }).catch(() => []);
  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab.id !== "number" || typeof tab.url !== "string" || !isSupportedPageUrl(tab.url) || !await pageSchemeAccessAllowed(tab.url)) {
      return;
    }
    const tabId = tab.id;
    const tabRevision = nextTabOverrideRevision(tabId);
    const resolved = resolveProfile(tab.url, settings, __GHOST_BUILD__);
    if (tabRevision !== currentTabOverrideRevision(tabId)) {
      return;
    }
    await refreshTabHeaderRule(tabId, resolved, settings);
    await refreshAdvancedOverrideForTab(tabId, resolved, settings, tabRevision);
  }));
}

async function refreshOpenPageProfiles(): Promise<void> {
  if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) {
    return;
  }

  const tabs = await chrome.tabs.query({ url: SUPPORTED_TAB_URL_PATTERNS }).catch(() => []);
  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab.id !== "number") {
      return;
    }
    await chrome.tabs.sendMessage(tab.id, {
      channel: __GHOST_CHANNEL__,
      type: "refreshProfile"
    }).catch(() => undefined);
  }));
}

async function updateActionIcon(settings: GhostSettings): Promise<void> {
  if (!chrome.action?.setIcon) {
    return;
  }
  try {
    await chrome.action.setIcon({
      path: headerRulesAllowed(settings) ? ENABLED_ICON_PATHS : DISABLED_ICON_PATHS
    });
  } catch {
    // Some Chromium variants reject non-standard action icon assets.
  }
}

function iconSet(state: "enabled" | "disabled"): Record<string, string> {
  return {
    16: `icons/${state}-16.png`,
    32: `icons/${state}-32.png`,
    48: `icons/${state}-48.png`,
    128: `icons/${state}-128.png`
  };
}

function runBackgroundTask(task: Promise<unknown>): void {
  void task.catch((error) => console.error("Ghost background task failed", error));
}

function assertNever(value: never): never {
  throw new Error(`Unknown message: ${JSON.stringify(value)}`);
}
