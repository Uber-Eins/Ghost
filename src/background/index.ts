import { applyAdvancedOverrides, clearAdvancedOverrides } from "./advanced";
import { fetchAutomaticLocation } from "./automatic-location";
import { isSynchronousContentBootstrapAvailable, refreshContentBootstrap } from "./bootstrap";
import { clearTabHeaderRule, refreshHeaderRules, refreshTabHeaderRule, prepareHeaderRules } from "./dnr";
import { getSessionSalt } from "./session-seed";
import { stableSeed } from "../shared/hash";
import { applyHeliumFlagDetection, detectHeliumFlags, normalizeHeliumFlagDetection, sameHeliumSurfaces } from "../shared/helium-detect";
import type { HeliumFlagDetection } from "../shared/helium-detect";
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
  loadSettings,
  resolveProfile,
  saveSettings
} from "../shared/storage";
import type { GhostSettings, PopupState, RuntimeRequest, RuntimeResponse } from "../shared/types";

declare const __GHOST_CHANNEL__: string;

const ENABLED_ICON_PATHS = iconSet("enabled");
const DISABLED_ICON_PATHS = iconSet("disabled");
const TEMPORARY_DISABLE_EXPIRED_ALARM = "ghost-temporary-disable-expired";
const AUTOMATIC_LOCATION_REFRESH_ALARM = "ghost-automatic-location-refresh";
const AUTOMATIC_LOCATION_REFRESH_MINUTES = 5;
const AUTOMATIC_LOCATION_FRESH_MS = AUTOMATIC_LOCATION_REFRESH_MINUTES * 60_000;
const SUPPORTED_TAB_URL_PATTERNS = ["http://*/*", "https://*/*", "file:///*"];
let settingsRevision = 0;
let settingsApplicationQueue: Promise<void> = Promise.resolve();
let automaticLocationRefresh: Promise<GhostSettings> | null = null;
let initialization: Promise<void> | null = null;
const tabOverrideRevisions = new Map<number, number>();

chrome.runtime.onInstalled.addListener(() => {
  runBackgroundTask(initialize().then(() => Promise.all([
    synchronizeAutomaticLocation(true),
    synchronizeHeliumFlagsFromRuntime()
  ])));
});

chrome.runtime.onStartup.addListener(() => {
  runBackgroundTask(initialize().then(() => Promise.all([
    synchronizeAutomaticLocation(true),
    synchronizeHeliumFlagsFromRuntime()
  ])));
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === TEMPORARY_DISABLE_EXPIRED_ALARM) {
    runBackgroundTask(handleTemporaryDisableExpired());
  } else if (alarm.name === AUTOMATIC_LOCATION_REFRESH_ALARM) {
    runBackgroundTask(synchronizeAutomaticLocation(true));
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
  if (isSupportedPageUrl(changeInfo.url)) {
    runBackgroundTask(synchronizeAutomaticLocation(false));
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeRequest, sender, sendResponse: (response: RuntimeResponse) => void) => {
  void handleMessage(message, sender)
    .then((value) => sendResponse({ ok: true, value }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  return true;
});

// A service-worker wake is not necessarily an onStartup/onInstalled event.
// Reconcile persisted global protection on each new worker instance; reuse
// the same promise if an install/startup event arrives in this instance.
runBackgroundTask(initialize());

function initialize(): Promise<void> {
  if (!initialization) {
    initialization = mutateAndRefresh(() => {}).then(() => undefined);
    void initialization.catch(() => { initialization = null; });
  }
  return initialization;
}

async function handleMessage(message: RuntimeRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "resolveProfile":
      return handleResolveProfile(message.url, sender);
    case "getPopupState":
      return getPopupState(message.url);
    case "recheckContentBootstrap":
      return enqueueSettingsApplication(async () => refreshContentBootstrap(await loadSettings(), await getSessionSalt()));
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
    case "syncHeliumFlags":
      return applyDetectedHeliumFlags(normalizeHeliumFlagDetection(message.detection));
    case "options.getState":
      // Wait for the short global commit, never the detached tab fan-outs.
      return readAppliedSettings();
    case "options.saveState": {
      const settings = await mutateAndRefresh((draft) => {
        const normalized = normalizeSettings(message.settings);
        Object.assign(draft, normalized, { automaticLocation: draft.automaticLocation });
      });
      if (settings.automaticLocationEnabled) {
        runBackgroundTask(synchronizeAutomaticLocation(true));
      }
      return settings;
    }
    case "options.refreshAutomaticLocation":
      return synchronizeAutomaticLocation(true);
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
  const topLevelUrl = trustedTopLevelUrl(sender, pageUrl);
  const tabId = shouldApplyTabWideOverrides(sender) ? sender.tab.id : null;
  const tabRevision = tabId === null ? 0 : nextTabOverrideRevision(tabId);
  if (!pageUrl) {
    const settings = await readAppliedSettings();
    const profile = findProfile(undefined, settings.customProfiles, settings.hiddenPresetProfileIds);
    return {
      enabled: false,
      uaSpoofingEnabled: false,
      canvasMeasureTextSpoofingEnabled: false,
      webglInfoSpoofingEnabled: false,
      mediaDeviceListEnabled: false,
      singleScreenEnabled: false,
      reason: "unsupported-url",
      siteKey: unsupportedPageLabel(url),
      seed: stableSeed("", profile.id),
      profile,
      advanced: {
        attempted: false,
        applied: false
      }
    };
  }

  const sessionSalt = await getSessionSalt();
  const settings = await refreshExpiredTemporaryDisable(await readAppliedSettings());
  const revision = settingsRevision;
  const resolved = resolveFrameProfile(pageUrl, topLevelUrl, settings, sessionSalt);

  if (tabId !== null && tabRevision === currentTabOverrideRevision(tabId)) {
    await refreshTabHeaderRule(tabId, resolved, settings, () => (
      revision === settingsRevision && tabRevision === currentTabOverrideRevision(tabId)
    ));
  }

  if (revision !== settingsRevision) {
    return resolveFrameProfile(pageUrl, topLevelUrl, await readAppliedSettings(), sessionSalt);
  }

  if (tabId !== null) {
    // The synchronous bootstrap/page profile is already usable. Do not hold
    // its reply behind a paused or unresponsive debugger target. Advanced
    // metadata stays unapplied in this reply; it is not a completion report.
    runBackgroundTask(refreshAdvancedOverrideForTab(tabId, resolved, settings, tabRevision));
  }

  return resolved;
}

function trustedTopLevelUrl(sender: chrome.runtime.MessageSender, fallbackUrl: string): string {
  const tabUrl = sender.tab?.url;
  return typeof tabUrl === "string" && isSupportedPageUrl(tabUrl) ? tabUrl : fallbackUrl;
}

function resolveFrameProfile(pageUrl: string, topLevelUrl: string, settings: GhostSettings, sessionSalt: string) {
  return resolveProfile(pageUrl, settings, Date.now(), topLevelUrl, sessionSalt);
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
): Promise<void> {
  const revision = settingsRevision;
  const isCurrent = () => revision === settingsRevision && tabRevision === currentTabOverrideRevision(tabId);
  if (resolved.enabled && settings.advancedEnabled) {
    await applyAdvancedOverrides(tabId, resolved.profile, resolved.seed, isCurrent);
  } else {
    await clearAdvancedOverrides(tabId, isCurrent);
  }
}

async function refreshTabForNavigation(tabId: number, url: string, tabRevision: number): Promise<void> {
  const isCurrent = () => tabRevision === currentTabOverrideRevision(tabId);
  const supported = isAccessiblePageUrl(url, await pageSchemeAccessAllowed(url));
  if (!isCurrent()) {
    return;
  }
  await clearTabHeaderRule(tabId, isCurrent);
  await clearAdvancedOverrides(tabId, isCurrent);
  if (tabRevision !== currentTabOverrideRevision(tabId)) {
    return;
  }
  if (!supported) {
    return;
  }

  const sessionSalt = await getSessionSalt();
  const settings = await readAppliedSettings();
  const revision = settingsRevision;
  if (tabRevision !== currentTabOverrideRevision(tabId)) {
    return;
  }
  const resolved = resolveFrameProfile(url, url, settings, sessionSalt);
  await refreshTabHeaderRule(tabId, resolved, settings, () => (
    revision === settingsRevision && tabRevision === currentTabOverrideRevision(tabId)
  ));
  if (revision !== settingsRevision) {
    return;
  }
  await refreshAdvancedOverrideForTab(tabId, resolved, settings, tabRevision);
}

async function getPopupState(url: string): Promise<PopupState> {
  // Only the global commit gates a control-panel read, not open-tab updates.
  const settings = await readAppliedSettings();
  if (settings.temporaryDisabledUntil !== null && settings.temporaryDisabledUntil <= Date.now()) {
    runBackgroundTask(refreshExpiredTemporaryDisable(settings));
  }
  const earlyBootstrapAvailable = await isSynchronousContentBootstrapAvailable();
  const protocolSupported = isSupportedPageUrl(url);
  const fileAccessRequired = protocolSupported && url.startsWith("file:") && !await pageSchemeAccessAllowed(url);
  if (!protocolSupported || fileAccessRequired) {
    const profile = protocolSupported
      ? resolveProfile(url, settings).profile
      : findProfile(undefined, settings.customProfiles, settings.hiddenPresetProfileIds);
    return {
      settings,
      url,
      siteKey: fileAccessRequired ? siteKeyFromUrl(url) : unsupportedPageLabel(url),
      supportedPage: false,
      fileAccessRequired,
      earlyBootstrapAvailable,
      enabledForSite: false,
      profile,
      profiles: profilesFromSettings(settings)
    };
  }

  const siteKey = siteKeyFromUrl(url);
  const resolved = resolveProfile(url, settings);
  return {
    settings,
    url,
    siteKey,
    supportedPage: true,
    fileAccessRequired: false,
    earlyBootstrapAvailable,
    enabledForSite: !isExcludedUrl(url, settings.excludedDomains),
    profile: resolved.profile,
    profiles: profilesFromSettings(settings)
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

function mutateAndRefresh(mutator: (settings: GhostSettings) => void | false): Promise<GhostSettings> {
  return enqueueSettingsApplication(async () => {
    const previous = await loadSettings();
    const draft = structuredClone(previous);
    if (mutator(draft) === false) return previous;
    const settings = normalizeSettings(draft);
    const rules = await prepareHeaderRules(settings);
    const revision = ++settingsRevision;
    await saveSettings(settings);
    try {
      await applyGlobalSettings(settings, rules);
    } catch (error) {
      try {
        await saveSettings(previous);
        await applyGlobalSettings(previous, await prepareHeaderRules(previous));
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Ghost failed to apply settings and to restore the previous runtime state.");
      }
      refreshTabs(previous, revision);
      throw error;
    }
    refreshTabs(settings, revision);
    return settings;
  });
}

function enqueueSettingsApplication<T>(operation: () => Promise<T>): Promise<T> {
  const pending = settingsApplicationQueue.then(operation, operation);
  settingsApplicationQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

async function readAppliedSettings(): Promise<GhostSettings> {
  while (true) {
    const pending = settingsApplicationQueue;
    await pending;
    const settings = await loadSettings();
    if (pending === settingsApplicationQueue) {
      return settings;
    }
  }
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

async function applyGlobalSettings(settings: GhostSettings, rules: chrome.declarativeNetRequest.Rule[]): Promise<void> {
  await scheduleTemporaryDisableAlarm(settings);
  await scheduleAutomaticLocationAlarm(settings);
  await refreshContentBootstrap(settings, await getSessionSalt());
  await refreshHeaderRules(rules);
  await updateActionIcon(settings);
}

function refreshTabs(settings: GhostSettings, revision: number): void {
  // A slow debugger or content-script reply must not hold the settings queue.
  runBackgroundTask(refreshOpenPageProfiles(revision));
  runBackgroundTask(refreshKnownTabOverrides(settings, revision));
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

async function scheduleAutomaticLocationAlarm(settings: GhostSettings): Promise<void> {
  if (!chrome.alarms) {
    return;
  }
  await chrome.alarms.clear(AUTOMATIC_LOCATION_REFRESH_ALARM).catch(() => false);
  if (settings.automaticLocationEnabled) {
    await chrome.alarms.create(AUTOMATIC_LOCATION_REFRESH_ALARM, {
      periodInMinutes: AUTOMATIC_LOCATION_REFRESH_MINUTES
    });
  }
}

async function synchronizeAutomaticLocation(force: boolean): Promise<GhostSettings> {
  // Network I/O is deliberately kept outside settingsApplicationQueue. That
  // queue covers commits/global protection, not tab fan-outs or network I/O.
  const settings = await readAppliedSettings();
  if (!settings.automaticLocationEnabled) {
    return settings;
  }
  if (
    !force
    && settings.automaticLocation
    && Date.now() - settings.automaticLocation.updatedAt < AUTOMATIC_LOCATION_FRESH_MS
  ) {
    return settings;
  }
  if (automaticLocationRefresh) {
    return automaticLocationRefresh;
  }

  automaticLocationRefresh = fetchAutomaticLocation()
    .then((location) => mutateAndRefresh((draft) => {
      if (!draft.automaticLocationEnabled) return false;
      draft.automaticLocation = location;
    }))
    .finally(() => {
      automaticLocationRefresh = null;
    });
  return automaticLocationRefresh;
}

// The service worker can probe WebGL and client hints itself; the measureText
// probe needs real documents, so that switch is only synced from Ghost's pages.
async function synchronizeHeliumFlagsFromRuntime(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.heliumFlagSync) {
    return;
  }
  await applyDetectedHeliumFlags(await detectHeliumFlags());
}

async function applyDetectedHeliumFlags(detection: HeliumFlagDetection): Promise<GhostSettings> {
  const current = await readAppliedSettings();
  if (!current.heliumFlagSync || sameHeliumSurfaces(current, applyHeliumFlagDetection(current, detection))) {
    return current;
  }
  return mutateAndRefresh((draft) => {
    if (!draft.heliumFlagSync) {
      return;
    }
    const applied = applyHeliumFlagDetection(draft, detection);
    draft.disableUserAgentSpoofing = applied.disableUserAgentSpoofing;
    draft.disableCanvasMeasureTextSpoofing = applied.disableCanvasMeasureTextSpoofing;
    draft.disableWebglInfoSpoofing = applied.disableWebglInfoSpoofing;
  });
}

async function refreshKnownTabOverrides(settings: GhostSettings, revision: number): Promise<void> {
  if (!chrome.tabs?.query) {
    return;
  }
  const sessionSalt = await getSessionSalt();
  const tabs = await chrome.tabs.query({ url: SUPPORTED_TAB_URL_PATTERNS }).catch(() => []);
  await Promise.all(tabs.map(async (tab) => {
    if (revision !== settingsRevision) {
      return;
    }
    if (typeof tab.id !== "number" || typeof tab.url !== "string" || !isSupportedPageUrl(tab.url) || !await pageSchemeAccessAllowed(tab.url)) {
      return;
    }
    if (revision !== settingsRevision) return;
    const tabId = tab.id;
    const tabRevision = nextTabOverrideRevision(tabId);
    const isCurrent = () => (
      revision === settingsRevision && tabRevision === currentTabOverrideRevision(tabId)
    );
    const resolved = resolveFrameProfile(tab.url, tab.url, settings, sessionSalt);
    if (!isCurrent()) {
      return;
    }
    await refreshTabHeaderRule(tabId, resolved, settings, isCurrent);
    if (!isCurrent()) {
      return;
    }
    await refreshAdvancedOverrideForTab(tabId, resolved, settings, tabRevision);
  }));
}

async function refreshOpenPageProfiles(revision: number): Promise<void> {
  if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) {
    return;
  }

  const tabs = await chrome.tabs.query({ url: SUPPORTED_TAB_URL_PATTERNS }).catch(() => []);
  await Promise.all(tabs.map(async (tab) => {
    if (revision !== settingsRevision || typeof tab.id !== "number") {
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
