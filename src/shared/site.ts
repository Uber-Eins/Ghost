const COMMON_SECOND_LEVEL_SUFFIXES = new Set([
  "ac.uk",
  "co.uk",
  "gov.uk",
  "ltd.uk",
  "me.uk",
  "net.uk",
  "nhs.uk",
  "org.uk",
  "plc.uk",
  "com.au",
  "edu.au",
  "gov.au",
  "net.au",
  "org.au",
  "co.jp",
  "ne.jp",
  "or.jp",
  "com.sg",
  "edu.sg",
  "gov.sg",
  "net.sg",
  "org.sg",
  "com.br",
  "com.cn",
  "com.hk",
  "com.mx",
  "co.in",
  "co.kr",
  "co.nz",
  "co.za"
]);

export function normalizeHostname(hostname: string): string {
  return hostname.trim().replace(/\.$/, "").toLowerCase();
}

export function siteKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return siteKeyFromHostname(parsed.hostname);
  } catch {
    return "";
  }
}

export function siteKeyFromHostname(hostname: string): string {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return "";
  }
  if (normalized === "localhost" || isIpAddress(normalized)) {
    return normalized;
  }

  const labels = normalized.split(".").filter(Boolean);
  if (labels.length <= 2) {
    return labels.join(".");
  }

  const lastTwo = labels.slice(-2).join(".");
  if (COMMON_SECOND_LEVEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

export function domainMatches(siteKey: string, candidate: string): boolean {
  const normalizedSite = normalizeHostname(siteKey);
  const normalizedCandidate = normalizeHostname(candidate);
  return normalizedSite === normalizedCandidate || normalizedSite.endsWith(`.${normalizedCandidate}`);
}

export function isExcluded(siteKey: string, excludedDomains: string[]): boolean {
  return excludedDomains.some((domain) => domainMatches(siteKey, domain));
}

function isIpAddress(hostname: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
  }
  return hostname.includes(":");
}
