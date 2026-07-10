import type { BuildTarget, GhostSettings } from "../shared/types";

const PAGE_MAIN_USER_SCRIPT_ID = "ghost-page-main";
const PAGE_MAIN_FALLBACK_SCRIPT_ID = "ghost-page-main-fallback";
const LEGACY_BOOTSTRAP_FALLBACK_SCRIPT_ID = "ghost-bootstrap-fallback";
const PAGE_MAIN_MATCHES = ["http://*/*", "https://*/*", "file:///*"];

export async function refreshContentBootstrap(settings: GhostSettings, build: BuildTarget): Promise<void> {
  let userScriptAvailable = false;
  if (chrome.userScripts?.register) {
    const script: chrome.userScripts.RegisteredUserScript = {
      id: PAGE_MAIN_USER_SCRIPT_ID,
      matches: PAGE_MAIN_MATCHES,
      allFrames: true,
      runAt: "document_start",
      world: "MAIN",
      js: [
        { code: bootstrapCode(settings, build) },
        { file: "page-main.js" }
      ]
    };

    try {
      const registered = await chrome.userScripts.getScripts({ ids: [PAGE_MAIN_USER_SCRIPT_ID] });
      if (registered.length > 0) {
        await chrome.userScripts.update([script]);
      } else {
        await chrome.userScripts.register([script]);
      }
      userScriptAvailable = true;
    } catch {
      await unregisterPageMainUserScript();
    }
  }

  // userScripts cannot match related about:/data:/blob: frames. When it is
  // available, the packaged fallback exits on normal URLs and only protects
  // those related frames. Otherwise it provides the normal asynchronous path.
  await refreshFallbackContentScript(userScriptAvailable);
}

export async function isSynchronousContentBootstrapAvailable(): Promise<boolean> {
  if (!chrome.userScripts?.getScripts) {
    return false;
  }
  try {
    const scripts = await chrome.userScripts.getScripts({ ids: [PAGE_MAIN_USER_SCRIPT_ID] });
    return scripts.length > 0;
  } catch {
    return false;
  }
}

function bootstrapCode(settings: GhostSettings, build: BuildTarget): string {
  const payload = JSON.stringify({ build, settings });
  return `(()=>{const p=${payload};try{Object.defineProperty(globalThis,"__GHOST_BOOTSTRAP_SETTINGS__",{value:p,configurable:true});}catch{globalThis.__GHOST_BOOTSTRAP_SETTINGS__=p;}})();`;
}

async function refreshFallbackContentScript(relatedOnly: boolean): Promise<void> {
  if (!chrome.scripting?.registerContentScripts) {
    return;
  }

  const scripts: chrome.scripting.RegisteredContentScript[] = [{
    id: PAGE_MAIN_FALLBACK_SCRIPT_ID,
    matches: PAGE_MAIN_MATCHES,
    allFrames: true,
    matchOriginAsFallback: true,
    runAt: "document_start",
    world: "MAIN",
    js: [relatedOnly ? "page-related.js" : "page-main.js"],
    persistAcrossSessions: true
  }];

  const registered = await chrome.scripting.getRegisteredContentScripts({
    ids: [PAGE_MAIN_FALLBACK_SCRIPT_ID, LEGACY_BOOTSTRAP_FALLBACK_SCRIPT_ID]
  }).catch(() => []);
  if (registered.some((script) => script.id === LEGACY_BOOTSTRAP_FALLBACK_SCRIPT_ID)) {
    await chrome.scripting.unregisterContentScripts({ ids: [LEGACY_BOOTSTRAP_FALLBACK_SCRIPT_ID] });
  }
  if (registered.some((script) => script.id === PAGE_MAIN_FALLBACK_SCRIPT_ID)) {
    await chrome.scripting.updateContentScripts(scripts);
  } else {
    await chrome.scripting.registerContentScripts(scripts);
  }
}

async function unregisterPageMainUserScript(): Promise<void> {
  if (!chrome.userScripts?.unregister) {
    return;
  }

  try {
    await chrome.userScripts.unregister({ ids: [PAGE_MAIN_USER_SCRIPT_ID] });
  } catch {
    // The user script may not be registered, or the API may be unavailable in this browser.
  }
}
