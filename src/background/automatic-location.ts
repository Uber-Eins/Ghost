import { IPPURE_INFO_URL, parseIpPureLocation } from "../shared/automatic-location";
import type { AutomaticLocation } from "../shared/types";

const REQUEST_TIMEOUT_MS = 3_000;

export async function fetchAutomaticLocation(): Promise<AutomaticLocation> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(IPPURE_INFO_URL, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`IPPure returned HTTP ${response.status}`);
    }
    const location = parseIpPureLocation(await response.json());
    if (!location) {
      throw new Error("IPPure returned an invalid location response");
    }
    return location;
  } finally {
    clearTimeout(timeout);
  }
}
