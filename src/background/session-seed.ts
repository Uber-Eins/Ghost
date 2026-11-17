import { readSessionSalt, SESSION_SALT_KEY } from "../shared/session-seed";

let sessionSalt: Promise<string> | null = null;

export function getSessionSalt(): Promise<string> {
  if (!sessionSalt) {
    sessionSalt = loadOrCreateSessionSalt();
    void sessionSalt.catch(() => { sessionSalt = null; });
  }
  return sessionSalt;
}

async function loadOrCreateSessionSalt(): Promise<string> {
  const stored = await readSessionSalt();
  if (stored) {
    return stored;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  // Session storage survives worker suspension, but not a browser restart.
  await chrome.storage.session.set({ [SESSION_SALT_KEY]: salt });
  return salt;
}
