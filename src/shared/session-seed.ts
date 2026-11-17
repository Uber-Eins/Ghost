export const SESSION_SALT_KEY = "ghost.sessionNoiseSalt";

// UI bootstrap repair may read the salt, but only the background creates it.
export async function readSessionSalt(): Promise<string | undefined> {
  const stored = await chrome.storage.session.get(SESSION_SALT_KEY);
  const salt: unknown = stored[SESSION_SALT_KEY];
  return typeof salt === "string" && salt.length > 0 ? salt : undefined;
}
