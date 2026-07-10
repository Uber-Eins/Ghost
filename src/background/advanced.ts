import { navigatorPlatformForProfile, runtimeUserAgent, userAgentForProfile, userAgentMetadataForProfile } from "../shared/profiles";
import type { Profile } from "../shared/types";

const PROTOCOL_VERSION = "1.3";

type Debuggee = chrome.debugger.Debuggee;

const debuggerOperationQueues = new Map<number, Promise<void>>();
const ownedDebuggerTabs = new Set<number>();

chrome.debugger?.onDetach?.addListener((source) => {
  if (typeof source.tabId === "number") {
    ownedDebuggerTabs.delete(source.tabId);
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
  }

  if (detachError && await probeDebuggerOwnership(target)) {
    ownedDebuggerTabs.add(tabId);
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
  if (ownedDebuggerTabs.has(tabId)) {
    return;
  }

  // A debugger session can outlive an MV3 service-worker instance. Probe before
  // attaching so a restarted worker can recover ownership without relying on
  // Chrome's indistinguishable "Another debugger" error.
  if (await probeDebuggerOwnership(target)) {
    ownedDebuggerTabs.add(tabId);
    return;
  }

  try {
    await chrome.debugger.attach(target, PROTOCOL_VERSION);
    ownedDebuggerTabs.add(tabId);
  } catch (error) {
    // An attach may race another operation from this extension. Only suppress
    // the error if a command proves that this extension owns the session.
    if (await probeDebuggerOwnership(target)) {
      ownedDebuggerTabs.add(tabId);
      return;
    }
    throw error;
  }
}

async function probeDebuggerOwnership(target: Debuggee): Promise<boolean> {
  try {
    await sendCommand(target, "Runtime.enable");
    return true;
  } catch {
    return false;
  }
}

async function clearAndDetachOwnedSession(target: Debuggee, tabId: number, forceDetach = false): Promise<void> {
  const owned = forceDetach || ownedDebuggerTabs.has(tabId) || await probeDebuggerOwnership(target);
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
  }
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
