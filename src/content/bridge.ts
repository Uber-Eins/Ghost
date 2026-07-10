import { isSupportedPageUrl } from "../shared/internal";
import { siteKeyFromUrl } from "../shared/site";
import type { ResolvedProfile, RuntimeRequest, RuntimeResponse } from "../shared/types";

declare const __GHOST_CHANNEL__: string;

let profilePort: MessagePort | null = null;
let profileNonce: string | null = null;
const initialPageUrl = currentGhostPageUrl();

if (initialPageUrl) {
  window.addEventListener("message", (event) => {
    const data = event.data as { channel?: string; type?: string; nonce?: string } | null;
    const port = event.ports?.[0];
    if (event.source !== window || !data || data.channel !== __GHOST_CHANNEL__ || data.type !== "connect" || !data.nonce || !port) {
      return;
    }
    if (profilePort) {
      try {
        port.close();
      } catch {
        // Ignore duplicate or page-forged connection attempts.
      }
      return;
    }

    const nonce = data.nonce;
    profilePort = port;
    profileNonce = nonce;
    const activePort = port;
    activePort.onmessage = (messageEvent) => {
      const request = messageEvent.data as { channel?: string; type?: string; nonce?: string; requestId?: number } | null;
      if (!request || request.channel !== __GHOST_CHANNEL__ || request.type !== "resolve" || request.nonce !== nonce) {
        return;
      }
      void publishProfile(activePort, nonce, request.requestId);
    };
    activePort.onmessageerror = () => {
      if (profilePort === activePort) {
        profilePort = null;
        profileNonce = null;
      }
    };
    activePort.start();
    activePort.postMessage({
      channel: __GHOST_CHANNEL__,
      type: "connected",
      nonce
    });
  });

  chrome.runtime.onMessage.addListener((message: { channel?: string; type?: string }) => {
    if (message.channel !== __GHOST_CHANNEL__ || message.type !== "refreshProfile" || !profilePort || !profileNonce) {
      return;
    }
    try {
      profilePort.postMessage({
        channel: __GHOST_CHANNEL__,
        type: "refresh",
        nonce: profileNonce
      });
    } catch {
      profilePort = null;
      profileNonce = null;
    }
  });

  document.documentElement?.setAttribute("data-ghost-site", siteKeyFromUrl(initialPageUrl));
}

async function publishProfile(port: MessagePort, nonce: string, requestId?: number): Promise<void> {
  // The isolated-world location is authoritative. Never let MAIN-world page
  // code select another URL and drive tab-wide DNR/debugger side effects.
  const pageUrl = currentGhostPageUrl();
  if (!pageUrl) {
    return;
  }
  const response = await sendMessage<ResolvedProfile>({ type: "resolveProfile", url: pageUrl });
  if (!response || profilePort !== port || profileNonce !== nonce) {
    return;
  }
  try {
    port.postMessage({
      channel: __GHOST_CHANNEL__,
      type: "profile",
      nonce,
      requestId,
      payload: response
    });
  } catch {
    if (profilePort === port) {
      profilePort = null;
      profileNonce = null;
    }
  }
}

function currentGhostPageUrl(): string {
  if (isSupportedPageUrl(location.href)) {
    return location.href;
  }
  if (isSupportedPageUrl(document.referrer)) {
    return document.referrer;
  }
  try {
    return /^https?:\/\//.test(location.origin) ? `${location.origin}/` : "";
  } catch {
    return "";
  }
}

function sendMessage<T>(message: RuntimeRequest): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response: RuntimeResponse) => {
        if (chrome.runtime.lastError || !response?.ok) {
          resolve(null);
          return;
        }
        resolve((response.value ?? null) as T | null);
      });
    } catch {
      resolve(null);
    }
  });
}
