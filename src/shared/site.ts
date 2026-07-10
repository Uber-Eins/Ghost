export const DEFAULT_SITE_RULE = "*";
export const FILE_SITE_RULE = "file://";
export const DEFAULT_EXCLUDED_DOMAINS = [
  "google.com/recaptcha",
  "gstatic.com/recaptcha",
  "accounts.google.com",
  "accounts.youtube.com",
  "gitlab.com/users/sign_in",
  "challenges.cloudflare.com"
];

// Keep generated regex source bounded; the background also preflights every
// filter with Chrome because RE2's compiled-memory limit is not length-only.
const MAX_DNR_REGEX_FILTER_LENGTH = 2048;
const MAX_RULE_INPUT_LENGTH = MAX_DNR_REGEX_FILTER_LENGTH;

export interface HostPathRule {
  host: string;
  path: string | null;
  wildcard: boolean;
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().replace(/\.$/, "").toLowerCase();
}

export function siteKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      return FILE_SITE_RULE;
    }
    return siteKeyFromHostname(parsed.hostname);
  } catch {
    return "";
  }
}

export function siteKeyFromHostname(hostname: string): string {
  return normalizeHostname(hostname);
}

export function normalizeSiteRuleKey(value: string): string {
  const parsed = parseHostPathRule(value);
  if (!parsed) {
    return "";
  }
  return parsed.wildcard ? DEFAULT_SITE_RULE : parsed.host;
}

export function normalizeExclusionRule(value: string): string {
  const parsed = parseHostPathRule(value);
  if (!parsed) {
    return "";
  }
  if (parsed.wildcard) {
    return DEFAULT_SITE_RULE;
  }
  return parsed.path ? `${parsed.host}${parsed.path}` : parsed.host;
}

export function parseHostPathRule(value: string): HostPathRule | null {
  const raw = value.trim();
  if (!raw || raw.length >= MAX_RULE_INPUT_LENGTH) {
    return null;
  }
  if (raw === DEFAULT_SITE_RULE) {
    return { host: DEFAULT_SITE_RULE, path: null, wildcard: true };
  }

  const parsedUrl = parseRuleUrl(raw);
  if (!parsedUrl) {
    return null;
  }
  if (parsedUrl.protocol === "file:") {
    const path = normalizePathPattern(canonicalEncodedUrlPath(parsedUrl));
    if (path && !isSafeDnrPath(FILE_SITE_RULE, path)) {
      return null;
    }
    return { host: FILE_SITE_RULE, path, wildcard: false };
  }
  const host = normalizeRuleHost(parsedUrl.hostname);
  if (!host) {
    return null;
  }

  const path = normalizePathPattern(canonicalEncodedUrlPath(parsedUrl));
  if (path && !isSafeDnrPath(host, path)) {
    return null;
  }
  return { host, path, wildcard: false };
}

export function hostMatchesRule(hostname: string, ruleKey: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  const normalizedRule = normalizeSiteRuleKey(ruleKey);
  if (!normalizedHost || !normalizedRule) {
    return false;
  }
  if (normalizedRule === FILE_SITE_RULE || isBracketedIpv6(normalizedRule)) {
    return normalizedHost === normalizedRule;
  }
  return normalizedRule === DEFAULT_SITE_RULE
    || normalizedHost === normalizedRule
    || normalizedHost.endsWith(`.${normalizedRule}`);
}

export function domainMatches(siteKey: string, candidate: string): boolean {
  return hostMatchesRule(siteKey, candidate);
}

export function isExcludedUrl(url: string, excludedDomains: string[]): boolean {
  return excludedDomains.some((rule) => urlMatchesHostPathRule(url, rule));
}

export function isExcluded(siteKey: string, excludedDomains: string[]): boolean {
  return excludedDomains.some((rule) => hostMatchesRule(siteKey, rule));
}

export function exclusionAppliesToSiteKey(exclusion: string, siteKey: string): boolean {
  const parsedRule = parseHostPathRule(exclusion);
  if (!parsedRule) {
    return false;
  }
  return parsedRule.wildcard || hostMatchesRule(siteKey, parsedRule.host);
}

export function exclusionsForSiteToggle(
  excludedDomains: string[],
  siteKey: string,
  url: string,
  enabled: boolean
): string[] {
  const normalizedSiteKey = normalizeSiteRuleKey(siteKey);
  if (!normalizedSiteKey) {
    return [...excludedDomains];
  }
  return enabled
    ? excludedDomains.filter((rule) => !urlMatchesHostPathRule(url, rule))
    : [...new Set([...excludedDomains, normalizedSiteKey])];
}

export function urlMatchesHostPathRule(url: string, rule: string): boolean {
  const parsedRule = parseHostPathRule(rule);
  if (!parsedRule) {
    return false;
  }
  if (parsedRule.wildcard) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedRule.host === FILE_SITE_RULE) {
      if (parsedUrl.protocol !== "file:") {
        return false;
      }
      return parsedRule.path ? normalizedUrlPathForMatching(parsedUrl).startsWith(parsedRule.path) : true;
    }
    if (!hostMatchesRule(parsedUrl.hostname, parsedRule.host)) {
      return false;
    }
    if (!parsedRule.path) {
      return true;
    }
    return normalizedUrlPathForMatching(parsedUrl).startsWith(parsedRule.path);
  } catch {
    return hostMatchesRule(url, parsedRule.host) && !parsedRule.path;
  }
}

export function bestMatchingSiteRule(hostname: string, ruleKeys: Iterable<string>): string | undefined {
  let bestRule: string | undefined;
  let bestScore = -1;
  for (const ruleKey of ruleKeys) {
    const normalizedRule = normalizeSiteRuleKey(ruleKey);
    if (!normalizedRule || !hostMatchesRule(hostname, normalizedRule)) {
      continue;
    }
    const score = siteRuleSpecificity(normalizedRule);
    if (score > bestScore) {
      bestRule = normalizedRule;
      bestScore = score;
    }
  }
  return bestRule;
}

export function siteRuleSpecificity(ruleKey: string): number {
  const normalizedRule = normalizeSiteRuleKey(ruleKey);
  if (!normalizedRule || normalizedRule === DEFAULT_SITE_RULE) {
    return 0;
  }
  return normalizedRule.split(".").length * 1000 + normalizedRule.length;
}

export function requestPathStartRegexFilter(path: string): string {
  const normalizedPath = normalizePathPattern(path) ?? "/";
  return `^(?:https?|wss?)://[^/?#]+${escapeRegex(canonicalRequestPath(normalizedPath))}`;
}

export function requestFilePathStartRegexFilter(path: string | null): string {
  const normalizedPath = path ? canonicalRequestPath(normalizePathPattern(path) ?? "/") : "";
  return `^file://${escapeRegex(normalizedPath)}`;
}

export function requestHostPathStartRegexFilter(host: string, path: string | null): string {
  const normalizedPath = path ? canonicalRequestPath(normalizePathPattern(path) ?? "/") : "";
  const hostPrefix = `^(?:https?|wss?)://${escapeRegex(normalizeHostname(host))}(?::\\d+)?`;
  return normalizedPath
    ? `${hostPrefix}${escapeRegex(normalizedPath)}`
    : `${hostPrefix}(?:[/?#]|$)`;
}

function normalizePathPattern(path: string): string | null {
  if (!path || path === "/") {
    return null;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizedUrlPathForMatching(url: URL): string {
  return canonicalEncodedUrlPath(url);
}

function canonicalRequestPath(path: string): string {
  try {
    const url = new URL(path, "https://ghost.invalid");
    return canonicalEncodedUrlPath(url);
  } catch {
    return canonicalizePercentEscapes(encodeURI(path));
  }
}

function canonicalEncodedUrlPath(url: URL): string {
  return `${canonicalizePercentEscapes(url.pathname)}${canonicalizePercentEscapes(url.search)}`;
}

function canonicalizePercentEscapes(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "%") {
      result += character;
      continue;
    }
    const escape = value.slice(index + 1, index + 3);
    if (/^[0-9a-f]{2}$/i.test(escape)) {
      result += `%${escape.toUpperCase()}`;
      index += 2;
    } else {
      result += "%25";
    }
  }
  return result;
}

function isSafeDnrPath(host: string, path: string): boolean {
  const filters = host === FILE_SITE_RULE
    ? [requestFilePathStartRegexFilter(path)]
    : [requestPathStartRegexFilter(path), requestHostPathStartRegexFilter(host, path)];
  return filters.every((filter) => filter.length < MAX_DNR_REGEX_FILTER_LENGTH);
}

function parseRuleUrl(raw: string): URL | null {
  const urlText = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
    ? raw
    : raw.startsWith("//")
      ? `https:${raw}`
      : `https://${raw}`;
  try {
    return new URL(urlText);
  } catch {
    return null;
  }
}

function normalizeRuleHost(hostname: string): string | null {
  let host = normalizeHostname(hostname);
  if (host.startsWith("*.")) {
    host = host.slice(2);
  }
  return isValidRuleHost(host) ? host : null;
}

function isValidRuleHost(host: string): boolean {
  if (!host || host === DEFAULT_SITE_RULE || host.includes(":") || host.includes("[") || host.includes("]")) {
    return isBracketedIpv6(host);
  }
  if (host === "localhost") {
    return true;
  }
  if (host.length > 253) {
    return false;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host.split(".").every((part) => {
      const value = Number.parseInt(part, 10);
      return value >= 0 && value <= 255 && String(value) === part;
    });
  }
  return host.split(".").every((label) => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
}

function isBracketedIpv6(host: string): boolean {
  if (!host.startsWith("[") || !host.endsWith("]")) {
    return false;
  }
  try {
    return new URL(`http://${host}/`).hostname === host;
  } catch {
    return false;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
