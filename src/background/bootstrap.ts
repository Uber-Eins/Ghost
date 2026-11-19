import type { GhostSettings } from "../shared/types";

const PAGE_MAIN_USER_SCRIPT_ID = "ghost-page-main";
const PAGE_MAIN_FALLBACK_SCRIPT_ID = "ghost-page-main-fallback";
const LEGACY_BOOTSTRAP_FALLBACK_SCRIPT_ID = "ghost-bootstrap-fallback";
const PAGE_MAIN_MATCHES = ["http://*/*", "https://*/*", "file:///*"];

export async function refreshContentBootstrap(settings: GhostSettings, sessionSalt: string): Promise<boolean> {
  const userScripts = chrome.userScripts;
  const registered = await pageMainRegistrations(userScripts);
  if (registered === undefined || !userScripts) {
    await refreshFallbackContentScript(false);
    return false;
  }

  const script: chrome.userScripts.RegisteredUserScript = {
    id: PAGE_MAIN_USER_SCRIPT_ID,
    matches: PAGE_MAIN_MATCHES,
    allFrames: true,
    runAt: "document_start",
    world: "MAIN",
    js: [
      { code: bootstrapCode(settings, sessionSalt) },
      { file: "page-main.js" }
    ]
  };
  if (registered.length > 0) {
    await userScripts.update([script]);
  } else {
    await userScripts.register([script]);
  }
  await refreshFallbackContentScript(true);
  return true;
}

async function pageMainRegistrations(userScripts: typeof chrome.userScripts | undefined) {
  try {
    // Without authorization Chromium can hide the API, throw, or reject the call.
    return await userScripts?.getScripts({ ids: [PAGE_MAIN_USER_SCRIPT_ID] });
  } catch {
    return undefined;
  }
}

export async function isSynchronousContentBootstrapAvailable(): Promise<boolean> {
  return Boolean((await pageMainRegistrations(chrome.userScripts))?.length);
}

function bootstrapCode(settings: GhostSettings, sessionSalt: string): string {
  const payload = JSON.stringify({ settings, sessionSalt });
  return `(()=>{const p=${payload};try{Object.defineProperty(globalThis,"__GHOST_BOOTSTRAP_SETTINGS__",{value:p,configurable:true});}catch{globalThis.__GHOST_BOOTSTRAP_SETTINGS__=p;}})();`;
}

async function refreshFallbackContentScript(relatedOnly: boolean): Promise<void> {
  if (!chrome.scripting?.registerContentScripts) {
    return;
  }

  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [PAGE_MAIN_FALLBACK_SCRIPT_ID, LEGACY_BOOTSTRAP_FALLBACK_SCRIPT_ID]
  }).catch(() => []);
  if (registered.some((script) => script.id === LEGACY_BOOTSTRAP_FALLBACK_SCRIPT_ID)) {
    await chrome.scripting.unregisterContentScripts({ ids: [LEGACY_BOOTSTRAP_FALLBACK_SCRIPT_ID] });
  }
  if (!relatedOnly) {
    if (registered.some((script) => script.id === PAGE_MAIN_FALLBACK_SCRIPT_ID)) {
      await chrome.scripting.unregisterContentScripts({ ids: [PAGE_MAIN_FALLBACK_SCRIPT_ID] });
    }
    return;
  }

  const scripts: chrome.scripting.RegisteredContentScript[] = [{
    id: PAGE_MAIN_FALLBACK_SCRIPT_ID,
    matches: PAGE_MAIN_MATCHES,
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: "document_start",
    world: "MAIN",
    js: ["page-related.js"],
    persistAcrossSessions: true
  }];

  if (registered.some((script) => script.id === PAGE_MAIN_FALLBACK_SCRIPT_ID)) {
    await chrome.scripting.updateContentScripts(scripts);
  } else {
    await chrome.scripting.registerContentScripts(scripts);
  }
}

export async function openUserScriptsSettingsPage(): Promise<void> {
  const majorVersion = Number(navigator.userAgent.match(/(?:Chrome|Chromium)\/([0-9]+)/)?.[1] ?? 0);
  const url = majorVersion >= 138
    ? `chrome://extensions/?id=${chrome.runtime.id}`
    : "chrome://extensions/";
  await chrome.tabs.create({ url });
}
