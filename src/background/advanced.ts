import type { Profile } from "../shared/types";

const PROTOCOL_VERSION = "1.3";
const OWNED_DEBUGGER_TABS_KEY = "ghost.advanced.ownedDebuggerTabs";
const WORKER_PRELUDE_KEY_PREFIX = "ghost.advanced.workerPrelude.";
// Dedicated workers start paused so their identity is installed before any
// worker script runs. Only worker targets are auto-attached; frames are not.
const WORKER_AUTO_ATTACH = {
  autoAttach: true,
  waitForDebuggerOnStart: true,
  flatten: true,
  filter: [{ type: "worker" }]
};

type Debuggee = chrome.debugger.DebuggerSession;

const debuggerOperationQueues = new Map<number, Promise<void>>();
const ownedDebuggerTabs = new Set<number>();
let ownershipLoad: Promise<void> | null = null;
let ownershipWriteQueue: Promise<void> = Promise.resolve();

chrome.debugger?.onDetach?.addListener((source) => {
  const { tabId } = source;
  if (typeof tabId === "number") {
    void forgetWorkerPrelude(tabId);
    void loadOwnedDebuggerTabs().then(() => {
      ownedDebuggerTabs.delete(tabId);
      return persistOwnedDebuggerTabs();
    });
  }
});

chrome.debugger?.onEvent?.addListener((source, method, params) => {
  const { tabId } = source;
  const attached = params as { sessionId?: string; targetInfo?: { type?: string } } | undefined;
  if (method !== "Target.attachedToTarget" || typeof tabId !== "number" || !attached?.sessionId) {
    return;
  }
  void prepareWorker({ tabId, sessionId: attached.sessionId }, attached.targetInfo?.type === "worker");
});

async function prepareWorker(session: Debuggee & { tabId: number }, isWorker: boolean): Promise<void> {
  try {
    const prelude = isWorker ? await loadWorkerPrelude(session.tabId) : "";
    if (prelude) {
      await sendCommand(session, "Runtime.evaluate", { expression: prelude });
      // Workers created by this worker are its children, not the tab's.
      await bestEffortCommand(session, "Target.setAutoAttach", WORKER_AUTO_ATTACH);
    }
  } catch {
    // The worker keeps its native identity; it must still be resumed.
  } finally {
    await bestEffortCommand(session, "Runtime.runIfWaitingForDebugger");
  }
}

const workerPreludes = new Map<number, string>();

async function loadWorkerPrelude(tabId: number): Promise<string> {
  const cached = workerPreludes.get(tabId);
  if (cached !== undefined) {
    return cached;
  }
  // The service worker may have restarted since the override was applied.
  const key = WORKER_PRELUDE_KEY_PREFIX + tabId;
  const stored = (await chrome.storage?.session?.get(key))?.[key];
  return typeof stored === "string" ? stored : "";
}

async function storeWorkerPrelude(tabId: number, prelude: string): Promise<void> {
  workerPreludes.set(tabId, prelude);
  try {
    await chrome.storage?.session?.set({ [WORKER_PRELUDE_KEY_PREFIX + tabId]: prelude });
  } catch {
    // Without session storage, coverage lasts until the service worker restarts.
  }
}

async function forgetWorkerPrelude(tabId: number): Promise<void> {
  workerPreludes.delete(tabId);
  try {
    await chrome.storage?.session?.remove(WORKER_PRELUDE_KEY_PREFIX + tabId);
  } catch {
    // Nothing to clean up.
  }
}

export interface AdvancedResult {
  attempted: boolean;
  applied: boolean;
  error?: string;
}

export async function applyAdvancedOverrides(
  tabId: number,
  profile: Profile,
  isCurrent: () => boolean = () => true,
  workerPrelude = ""
): Promise<AdvancedResult> {
  if (!chrome.debugger) {
    return { attempted: false, applied: false };
  }

  return enqueueDebuggerOperation(tabId, () => isCurrent()
    ? applyAdvancedOverridesNow(tabId, profile, workerPrelude)
    : Promise.resolve({ attempted: false, applied: false }));
}

async function applyAdvancedOverridesNow(tabId: number, profile: Profile, workerPrelude: string): Promise<AdvancedResult> {
  const target: Debuggee = { tabId };
  let acquiredSession = false;
  try {
    await attachIfNeeded(target, tabId);
    acquiredSession = true;
    if (workerPrelude) {
      // Workers loaded from a URL cannot be rewritten by the page, so their
      // identity is evaluated in the worker itself. Failure leaves them native.
      // This goes first: a page can start a worker as soon as it loads.
      await storeWorkerPrelude(tabId, workerPrelude);
      await bestEffortCommand(target, "Target.setAutoAttach", WORKER_AUTO_ATTACH);
    }
    await sendCommand(target, "Emulation.setGeolocationOverride", {
      latitude: profile.latitude,
      longitude: profile.longitude,
      accuracy: profile.accuracy
    });
    await sendCommand(target, "Emulation.setTimezoneOverride", { timezoneId: profile.timezoneId });
    await sendCommand(target, "Emulation.setLocaleOverride", { locale: profile.intlLocale || profile.locale });
    // UA and Client Hints have one owner: either Ghost's page/header layer or
    // Helium. A second CDP override is observable and makes Turnstile reject an
    // otherwise valid browser session with the generic 600010 challenge error.
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

export async function clearAdvancedOverrides(tabId: number, isCurrent: () => boolean = () => true): Promise<void> {
  if (!chrome.debugger) {
    return;
  }

  await enqueueDebuggerOperation(tabId, () => isCurrent() ? clearAdvancedOverridesNow(tabId) : Promise.resolve());
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
  await forgetWorkerPrelude(tabId);
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
