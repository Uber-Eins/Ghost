import { isSupportedPageUrl } from "../shared/internal";
import { siteKeyFromUrl } from "../shared/site";
import type { ResolvedProfile, RuntimeRequest, RuntimeResponse } from "../shared/types";

declare const __GHOST_CHANNEL__: string;

let profilePort: MessagePort | null = null;

if (isSupportedPageUrl(location.href)) {
  window.addEventListener("message", (event) => {
    const data = event.data as { channel?: string; type?: string; nonce?: string } | null;
    const port = event.ports?.[0];
    if (event.source !== window || !data || data.channel !== __GHOST_CHANNEL__ || data.type !== "connect" || !data.nonce || !port) {
      return;
    }
    if (profilePort) {
      return;
    }

    const nonce = data.nonce;
    profilePort = port;
    const activePort = port;
    activePort.onmessage = (messageEvent) => {
      const request = messageEvent.data as { channel?: string; type?: string; nonce?: string; url?: string } | null;
      if (!request || request.channel !== __GHOST_CHANNEL__ || request.type !== "resolve" || request.nonce !== nonce) {
        return;
      }
      void publishProfile(activePort, nonce, request.url ?? location.href);
    };
    activePort.start();
  });

  document.documentElement?.setAttribute("data-ghost-site", siteKeyFromUrl(location.href));
}

async function publishProfile(port: MessagePort, nonce: string, url: string): Promise<void> {
  const response = await sendMessage<ResolvedProfile>({ type: "resolveProfile", url });
  if (!response) {
    return;
  }
  port.postMessage({
    channel: __GHOST_CHANNEL__,
    type: "profile",
    nonce,
    payload: response
  });
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
