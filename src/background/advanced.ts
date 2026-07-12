import { navigatorPlatformForProfile, runtimeUserAgent, userAgentForProfile, userAgentMetadataForProfile } from "../shared/profiles";
import type { Profile } from "../shared/types";

const PROTOCOL_VERSION = "1.3";
const OWNED_DEBUGGER_TABS_KEY = "ghost.advanced.ownedDebuggerTabs";

type Debuggee = chrome.debugger.Debuggee;

const debuggerOperationQueues = new Map<number, Promise<void>>();
const ownedDebuggerTabs = new Set<number>();
let ownershipLoad: Promise<void> | null = null;
let ownershipWriteQueue: Promise<void> = Promise.resolve();

chrome.debugger?.onDetach?.addListener((source) => {
  const { tabId } = source;
  if (typeof tabId === "number") {
    void loadOwnedDebuggerTabs().then(() => {
      ownedDebuggerTabs.delete(tabId);
      return persistOwnedDebuggerTabs();
    });
  }
});

export interface AdvancedResult {
  attempted: boolean;
  applied: boolean;
  error?: string;
}

export interface AdvancedOverrideOptions {
  userAgent: boolean;
}

export async function applyAdvancedOverrides(tabId: number, profile: Profile, options: AdvancedOverrideOptions): Promise<AdvancedResult> {
  if (!chrome.debugger) {
    return { attempted: false, applied: false };
  }

  return enqueueDebuggerOperation(tabId, () => applyAdvancedOverridesNow(tabId, profile, options));
}

async function applyAdvancedOverridesNow(tabId: number, profile: Profile, options: AdvancedOverrideOptions): Promise<AdvancedResult> {
  const target: Debuggee = { tabId };
  const nativeUserAgent = runtimeUserAgent();
  let acquiredSession = false;
  try {
    await attachIfNeeded(target, tabId);
    acquiredSession = true;
    if (!options.userAgent) {
      await resetDebuggerSession(target, tabId);
    }
    await sendCommand(target, "Emulation.setGeolocationOverride", {
      latitude: profile.latitude,
      longitude: profile.longitude,
      accuracy: profile.accuracy
    });
    await sendCommand(target, "Emulation.setTimezoneOverride", { timezoneId: profile.timezoneId });
    await sendCommand(target, "Emulation.setLocaleOverride", { locale: profile.intlLocale || profile.locale });
    if (options.userAgent) {
      const metadata = userAgentMetadataForProfile(profile, nativeUserAgent);
      const params: Record<string, unknown> = {
        userAgent: userAgentForProfile(profile, nativeUserAgent),
        acceptLanguage: profile.acceptLanguage,
        platform: navigatorPlatformForProfile(profile, nativeUserAgent)
      };
      if (metadata) {
        params.userAgentMetadata = metadata;
      }
      await sendCommand(target, "Emulation.setUserAgentOverride", params);
    }
    return { attempted: true, applied: true };
  } catch (error) {
    await clearAndDetachOwnedSession(target, tabId, acquiredSession);
    return {
      attempted: true,
      applied: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function resetDebuggerSession(target: Debuggee, tabId: number): Promise<void> {
  let detachError: unknown;
  try {
    await chrome.debugger.detach(target);
  } catch (error) {
    detachError = error;
  } finally {
    ownedDebuggerTabs.delete(tabId);
    await persistOwnedDebuggerTabs();
  }

  if (detachError) {
    throw detachError;
  }

  await attachIfNeeded(target, tabId);
}

export async function clearAdvancedOverrides(tabId: number): Promise<void> {
  if (!chrome.debugger) {
    return;
  }

  await enqueueDebuggerOperation(tabId, () => clearAdvancedOverridesNow(tabId));
}

async function clearAdvancedOverridesNow(tabId: number): Promise<void> {
  const target: Debuggee = { tabId };
  await clearAndDetachOwnedSession(target, tabId);
}

async function attachIfNeeded(target: Debuggee, tabId: number): Promise<void> {
  await loadOwnedDebuggerTabs();
  if (ownedDebuggerTabs.has(tabId)) {
    return;
  }

  await chrome.debugger.attach(target, PROTOCOL_VERSION);
  ownedDebuggerTabs.add(tabId);
  await persistOwnedDebuggerTabs();
}

async function clearAndDetachOwnedSession(target: Debuggee, tabId: number, forceDetach = false): Promise<void> {
  await loadOwnedDebuggerTabs();
  const owned = forceDetach || ownedDebuggerTabs.has(tabId);
  if (!owned) {
    ownedDebuggerTabs.delete(tabId);
    return;
  }

  ownedDebuggerTabs.add(tabId);
  await bestEffortCommand(target, "Emulation.clearGeolocationOverride");
  await bestEffortCommand(target, "Emulation.setTimezoneOverride", { timezoneId: "" });
  await bestEffortCommand(target, "Emulation.setLocaleOverride", { locale: "" });
  try {
    await chrome.debugger.detach(target);
  } catch {
    // The target may have closed or another debugger may have replaced us.
  } finally {
    ownedDebuggerTabs.delete(tabId);
    await persistOwnedDebuggerTabs();
  }
}

function loadOwnedDebuggerTabs(): Promise<void> {
  if (!ownershipLoad) {
    ownershipLoad = (async () => {
      try {
        const stored = await chrome.storage?.session?.get(OWNED_DEBUGGER_TABS_KEY);
        const tabIds = stored?.[OWNED_DEBUGGER_TABS_KEY];
        if (Array.isArray(tabIds)) {
          for (const tabId of tabIds) {
            if (typeof tabId === "number" && Number.isInteger(tabId) && tabId >= 0) {
              ownedDebuggerTabs.add(tabId);
            }
          }
        }
      } catch {
        // Session storage is an optimization for service-worker restarts.
      }
    })();
  }
  return ownershipLoad;
}

function persistOwnedDebuggerTabs(): Promise<void> {
  ownershipWriteQueue = ownershipWriteQueue.then(async () => {
    try {
      await chrome.storage?.session?.set({
        [OWNED_DEBUGGER_TABS_KEY]: [...ownedDebuggerTabs]
      });
    } catch {
      // Losing the marker only disables restart recovery; never probe Runtime.
    }
  });
  return ownershipWriteQueue;
}

async function bestEffortCommand(target: Debuggee, method: string, commandParams?: object): Promise<void> {
  try {
    await sendCommand(target, method, commandParams);
  } catch {
    // Continue to detachment so partial overrides cannot survive one failure.
  }
}

function enqueueDebuggerOperation<T>(tabId: number, operation: () => Promise<T>): Promise<T> {
  const previous = debuggerOperationQueues.get(tabId) ?? Promise.resolve();
  const pending = previous.then(operation, operation);
  const tail = pending.then(() => undefined, () => undefined);
  debuggerOperationQueues.set(tabId, tail);
  void tail.then(() => {
    if (debuggerOperationQueues.get(tabId) === tail) {
      debuggerOperationQueues.delete(tabId);
    }
  });
  return pending;
}

function sendCommand(target: Debuggee, method: string, commandParams?: object): Promise<unknown> {
  return chrome.debugger.sendCommand(target, method, commandParams);
}
