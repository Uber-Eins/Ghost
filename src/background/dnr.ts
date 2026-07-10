import { hashHex } from "../shared/hash";
import { runtimeUserAgent, secChUaHeaderValue, userAgentForProfile, userAgentMetadataForProfile } from "../shared/profiles";
import {
  DEFAULT_SITE_RULE,
  FILE_SITE_RULE,
  normalizeSiteRuleKey,
  requestFilePathStartRegexFilter,
  parseHostPathRule,
  requestHostPathStartRegexFilter,
  requestPathStartRegexFilter,
  siteRuleSpecificity
} from "../shared/site";
import { headerRulesAllowed, profilesFromSettings } from "../shared/storage";
import type { GhostSettings, Profile, ResolvedProfile } from "../shared/types";

const RULE_ID_BASE = 700000;
const TAB_RULE_ID_BASE = 900000;
const RULE_ID_RANGE = 100000;
const TAB_RULE_ID_LIMIT = TAB_RULE_ID_BASE + RULE_ID_RANGE;
const EXCLUSION_RULE_PRIORITY = 1_000_000;
const FRAME_EXCLUSION_RULE_PRIORITY = EXCLUSION_RULE_PRIORITY + 1;
const TAB_RULE_PRIORITY = EXCLUSION_RULE_PRIORITY - 1;
const {
  ResourceType,
  RuleActionType,
  HeaderOperation
} = chrome.declarativeNetRequest;
const OPTIONAL_RESOURCE_TYPES = [ResourceType.WEBTRANSPORT, ResourceType.WEBBUNDLE]
  .filter((type): type is chrome.declarativeNetRequest.ResourceType => typeof type === "string");

const RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
  ResourceType.MAIN_FRAME,
  ResourceType.SUB_FRAME,
  ResourceType.STYLESHEET,
  ResourceType.SCRIPT,
  ResourceType.IMAGE,
  ResourceType.FONT,
  ResourceType.OBJECT,
  ResourceType.XMLHTTPREQUEST,
  ResourceType.PING,
  ResourceType.CSP_REPORT,
  ResourceType.MEDIA,
  ResourceType.WEBSOCKET,
  ...OPTIONAL_RESOURCE_TYPES,
  ResourceType.OTHER
];
const NAVIGATION_RESOURCE_TYPES = [ResourceType.MAIN_FRAME, ResourceType.SUB_FRAME];
const SUBRESOURCE_TYPES = RESOURCE_TYPES.filter((type) => !NAVIGATION_RESOURCE_TYPES.includes(type));
const MAX_GHOST_GLOBAL_RULES = 4500;
const MAX_GHOST_REGEX_RULES = 900;

let dnrRefreshQueue: Promise<void> = Promise.resolve();
const regexValidationCache = new Set<string>();

export function refreshHeaderRules(settings: GhostSettings): Promise<void> {
  return enqueueDnrUpdate(() => refreshHeaderRulesNow(settings));
}

export function refreshTabHeaderRule(tabId: number, resolved: ResolvedProfile, settings: GhostSettings): Promise<void> {
  return enqueueDnrUpdate(() => refreshTabHeaderRuleNow(tabId, resolved, settings));
}

export function clearTabHeaderRule(tabId: number): Promise<void> {
  return enqueueDnrUpdate(() => clearTabHeaderRuleNow(tabId));
}

export function clearTabHeaderRules(): Promise<void> {
  return enqueueDnrUpdate(clearTabHeaderRulesNow);
}

export async function validateHeaderRules(settings: GhostSettings): Promise<void> {
  await validateRules(buildRules(settings));
}

export function buildHeaderRulesForTesting(settings: GhostSettings): chrome.declarativeNetRequest.Rule[] {
  return buildRules(settings);
}

export function buildTabHeaderRulesForTesting(
  tabId: number,
  resolved: ResolvedProfile,
  settings: GhostSettings
): chrome.declarativeNetRequest.Rule[] {
  return tabRulesForResolvedPage(tabId, resolved, settings, new Set());
}

function enqueueDnrUpdate(operation: () => Promise<void>): Promise<void> {
  const pending = dnrRefreshQueue.then(operation, operation);
  dnrRefreshQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

async function refreshTabHeaderRuleNow(tabId: number, resolved: ResolvedProfile, settings: GhostSettings): Promise<void> {
  if (!chrome.declarativeNetRequest) {
    return;
  }

  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = existingRules.filter((rule) => ruleAppliesToTab(rule, tabId)).map((rule) => rule.id);
  const usedRuleIds = new Set(existingRules.map((rule) => rule.id));
  for (const ruleId of removeRuleIds) {
    usedRuleIds.delete(ruleId);
  }
  const addRules = tabRulesForResolvedPage(tabId, resolved, settings, usedRuleIds);
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds,
    addRules
  });
}

function tabRulesForResolvedPage(
  tabId: number,
  resolved: ResolvedProfile,
  settings: GhostSettings,
  usedRuleIds: Set<number>
): chrome.declarativeNetRequest.Rule[] {
  if (!resolved.enabled) {
    return [{
      id: nextTabRuleId(`tab:${tabId}:allow-native`, usedRuleIds),
      priority: FRAME_EXCLUSION_RULE_PRIORITY,
      action: { type: RuleActionType.ALLOW },
      condition: {
        tabIds: [tabId],
        resourceTypes: SUBRESOURCE_TYPES
      }
    }];
  }
  if (!headerRulesAllowed(settings) || !isTabScopedSiteKey(resolved.siteKey)) {
    return [];
  }
  return tabRulesForSpecialPage(tabId, resolved.profile, !settings.disableUserAgentSpoofing, usedRuleIds);
}

async function clearTabHeaderRuleNow(tabId: number): Promise<void> {
  if (!chrome.declarativeNetRequest) {
    return;
  }

  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = existingRules.filter((rule) => ruleAppliesToTab(rule, tabId)).map((rule) => rule.id);
  if (removeRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
  }
}

async function clearTabHeaderRulesNow(): Promise<void> {
  if (!chrome.declarativeNetRequest) {
    return;
  }

  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const removeRuleIds = existingRules
    .map((rule) => rule.id)
    .filter(isTabRuleId);
  if (removeRuleIds.length === 0) {
    return;
  }
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds });
}

async function refreshHeaderRulesNow(settings: GhostSettings): Promise<void> {
  if (!chrome.declarativeNetRequest) {
    return;
  }

  const legacySessionRules = await chrome.declarativeNetRequest.getSessionRules();
  const legacyRuleIds = legacySessionRules.map((rule) => rule.id).filter(isGlobalRuleId);
  if (legacyRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: legacyRuleIds });
  }
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = headerRulesAllowed(settings) ? buildRules(settings) : [];
  await validateRules(addRules);
  const removeRuleIds = new Set(existingRules
    .map((rule) => rule.id)
    .filter(isGlobalRuleId));
  for (const rule of addRules) {
    removeRuleIds.add(rule.id);
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [...removeRuleIds],
    addRules
  });
}

function buildRules(settings: GhostSettings): chrome.declarativeNetRequest.Rule[] {
  if (settings.excludedDomains.some(isWildcardExclusion)) {
    return [];
  }

  const profiles = profilesFromSettings(settings);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const usedRuleIds = new Set<number>();
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  for (const exclusion of settings.excludedDomains) {
    for (const rule of allowRulesForExclusion(exclusion, usedRuleIds)) {
      rules.push(rule);
    }
  }
  for (const [siteKey, profileId] of Object.entries(settings.siteProfiles)) {
    const ruleKey = normalizeSiteRuleKey(siteKey);
    const profile = profileById.get(profileId);
    if (!profile || !isDnrSiteRuleKey(ruleKey)) {
      continue;
    }
    rules.push(...rulesForSite(ruleKey, profile, usedRuleIds, !settings.disableUserAgentSpoofing));
  }
  return rules;
}

function isWildcardExclusion(exclusion: string): boolean {
  return parseHostPathRule(exclusion)?.wildcard ?? false;
}

function isDnrSiteRuleKey(siteKey: string): boolean {
  return siteKey === DEFAULT_SITE_RULE
    || siteKey === FILE_SITE_RULE
    || isDnrRequestDomain(siteKey)
    || siteKey.startsWith("[");
}

function rulesForSite(
  siteKey: string,
  profile: Profile,
  usedRuleIds: Set<number>,
  includeUserAgentHeaders: boolean
): chrome.declarativeNetRequest.Rule[] {
  const scopes = [
    { name: "navigation", condition: navigationCondition(siteKey) },
    { name: "subresource", condition: subresourceCondition(siteKey) }
  ].filter((scope): scope is { name: string; condition: chrome.declarativeNetRequest.RuleCondition } => Boolean(scope.condition));
  const priority = Math.max(1, siteRuleSpecificity(siteKey));
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  for (const scope of scopes) {
    rules.push(modifyHeadersRule(
      nextRuleId(`site:${scope.name}:base:${siteKey}`, usedRuleIds),
      priority,
      baseRequestHeadersForProfile(profile, includeUserAgentHeaders),
      scope.condition
    ));
    if (includeUserAgentHeaders && siteKey !== FILE_SITE_RULE) {
      for (const secureScope of secureOnlyConditions(scope.condition)) {
        rules.push(modifyHeadersRule(
          nextRuleId(`site:${scope.name}:hints:${secureScope.scheme}:${siteKey}`, usedRuleIds),
          priority,
          clientHintHeadersForProfile(profile),
          secureScope.condition
        ));
      }
    }
  }
  return rules;
}

function navigationCondition(siteKey: string): chrome.declarativeNetRequest.RuleCondition {
  const condition: chrome.declarativeNetRequest.RuleCondition = {
    resourceTypes: NAVIGATION_RESOURCE_TYPES
  };
  if (siteKey === DEFAULT_SITE_RULE) {
    return condition;
  }
  if (siteKey === FILE_SITE_RULE) {
    condition.regexFilter = requestFilePathStartRegexFilter(null);
  } else if (isDnrRequestDomain(siteKey)) {
    condition.requestDomains = [siteKey];
  } else {
    condition.regexFilter = requestHostPathStartRegexFilter(siteKey, null);
  }
  return condition;
}

function subresourceCondition(siteKey: string): chrome.declarativeNetRequest.RuleCondition | null {
  const condition: chrome.declarativeNetRequest.RuleCondition = {
    resourceTypes: SUBRESOURCE_TYPES
  };
  if (siteKey === DEFAULT_SITE_RULE) {
    return condition;
  }
  if (!isDnrRequestDomain(siteKey)) {
    return null;
  }
  condition.initiatorDomains = [siteKey];
  return condition;
}

function secureOnlyConditions(condition: chrome.declarativeNetRequest.RuleCondition): Array<{
  scheme: "https" | "wss";
  condition: chrome.declarativeNetRequest.RuleCondition;
}> {
  return (["https", "wss"] as const).map((scheme) => {
    const secureCondition = { ...condition };
    if (condition.regexFilter) {
      secureCondition.regexFilter = condition.regexFilter.replace("^(?:https?|wss?)://", `^${scheme}://`);
    } else {
      secureCondition.urlFilter = `|${scheme}://`;
    }
    return { scheme, condition: secureCondition };
  });
}

function modifyHeadersRule(
  id: number,
  priority: number,
  requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[],
  condition: chrome.declarativeNetRequest.RuleCondition
): chrome.declarativeNetRequest.Rule {
  return {
    id,
    priority,
    action: {
      type: RuleActionType.MODIFY_HEADERS,
      requestHeaders
    },
    condition
  };
}

function tabRulesForSpecialPage(
  tabId: number,
  profile: Profile,
  includeUserAgentHeaders: boolean,
  usedRuleIds: Set<number>
): chrome.declarativeNetRequest.Rule[] {
  const baseCondition: chrome.declarativeNetRequest.RuleCondition = {
    tabIds: [tabId],
    resourceTypes: SUBRESOURCE_TYPES
  };
  const rules = [modifyHeadersRule(
    nextTabRuleId(`tab:${tabId}:base`, usedRuleIds),
    TAB_RULE_PRIORITY,
    baseRequestHeadersForProfile(profile, includeUserAgentHeaders),
    baseCondition
  )];
  if (includeUserAgentHeaders) {
    for (const secureScope of secureOnlyConditions(baseCondition)) {
      rules.push(modifyHeadersRule(
        nextTabRuleId(`tab:${tabId}:hints:${secureScope.scheme}`, usedRuleIds),
        TAB_RULE_PRIORITY,
        clientHintHeadersForProfile(profile),
        secureScope.condition
      ));
    }
  }
  return rules;
}

function baseRequestHeadersForProfile(profile: Profile, includeUserAgentHeaders: boolean): chrome.declarativeNetRequest.ModifyHeaderInfo[] {
  const nativeUserAgent = runtimeUserAgent();
  const requestHeaders: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [
    { header: "Accept-Language", operation: HeaderOperation.SET, value: profile.acceptLanguage }
  ];
  if (!includeUserAgentHeaders) {
    return requestHeaders;
  }

  requestHeaders.push({ header: "User-Agent", operation: HeaderOperation.SET, value: userAgentForProfile(profile, nativeUserAgent) });
  return requestHeaders;
}

function clientHintHeadersForProfile(profile: Profile): chrome.declarativeNetRequest.ModifyHeaderInfo[] {
  const nativeUserAgent = runtimeUserAgent();
  const metadata = userAgentMetadataForProfile(profile, nativeUserAgent);
  if (metadata) {
    return [
      { header: "Sec-CH-UA", operation: HeaderOperation.SET, value: secChUaHeaderValue(metadata) },
      { header: "Sec-CH-UA-Platform", operation: HeaderOperation.SET, value: `"${metadata.platform}"` },
      { header: "Sec-CH-UA-Mobile", operation: HeaderOperation.SET, value: metadata.mobile ? "?1" : "?0" },
      { header: "Sec-CH-UA-Arch", operation: HeaderOperation.REMOVE },
      { header: "Sec-CH-UA-Bitness", operation: HeaderOperation.REMOVE },
      { header: "Sec-CH-UA-Full-Version", operation: HeaderOperation.REMOVE },
      { header: "Sec-CH-UA-Full-Version-List", operation: HeaderOperation.REMOVE },
      { header: "Sec-CH-UA-Model", operation: HeaderOperation.REMOVE },
      { header: "Sec-CH-UA-Platform-Version", operation: HeaderOperation.REMOVE }
    ];
  }
  return removeClientHintHeaders();
}

function allowRulesForExclusion(exclusion: string, usedRuleIds: Set<number>): chrome.declarativeNetRequest.Rule[] {
  const parsed = parseHostPathRule(exclusion);
  if (!parsed || parsed.wildcard) {
    return [];
  }
  const frameCondition = exclusionCondition(parsed.host, parsed.path, [ResourceType.MAIN_FRAME, ResourceType.SUB_FRAME]);
  const requestCondition = exclusionCondition(parsed.host, parsed.path, RESOURCE_TYPES);
  if (!frameCondition || !requestCondition) {
    return [];
  }
  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: nextRuleId(`exclude-frame:${exclusion}`, usedRuleIds),
      priority: FRAME_EXCLUSION_RULE_PRIORITY,
      action: {
        type: RuleActionType.ALLOW_ALL_REQUESTS
      },
      condition: frameCondition
    },
    {
      id: nextRuleId(`exclude-request:${exclusion}`, usedRuleIds),
      priority: EXCLUSION_RULE_PRIORITY,
      action: {
        type: RuleActionType.ALLOW
      },
      condition: requestCondition
    }
  ];
  if (!parsed.path && isDnrRequestDomain(parsed.host)) {
    rules.push({
      id: nextRuleId(`exclude-initiator:${exclusion}`, usedRuleIds),
      priority: EXCLUSION_RULE_PRIORITY,
      action: {
        type: RuleActionType.ALLOW
      },
      condition: {
        initiatorDomains: [parsed.host],
        resourceTypes: SUBRESOURCE_TYPES
      }
    });
  }
  return rules;
}

function exclusionCondition(host: string, path: string | null, resourceTypes: chrome.declarativeNetRequest.ResourceType[]): chrome.declarativeNetRequest.RuleCondition | null {
  const condition: chrome.declarativeNetRequest.RuleCondition = {
    resourceTypes
  };
  if (host === FILE_SITE_RULE) {
    condition.regexFilter = requestFilePathStartRegexFilter(path);
  } else if (isDnrRequestDomain(host)) {
    condition.requestDomains = [host];
    if (path) {
      condition.regexFilter = requestPathStartRegexFilter(path);
    }
  } else {
    condition.regexFilter = requestHostPathStartRegexFilter(host, path);
  }
  return condition;
}

function removeClientHintHeaders(): chrome.declarativeNetRequest.ModifyHeaderInfo[] {
  return [
    { header: "Sec-CH-UA", operation: HeaderOperation.REMOVE },
    { header: "Sec-CH-UA-Arch", operation: HeaderOperation.REMOVE },
    { header: "Sec-CH-UA-Bitness", operation: HeaderOperation.REMOVE },
    { header: "Sec-CH-UA-Full-Version", operation: HeaderOperation.REMOVE },
    { header: "Sec-CH-UA-Full-Version-List", operation: HeaderOperation.REMOVE },
    { header: "Sec-CH-UA-Mobile", operation: HeaderOperation.REMOVE },
    { header: "Sec-CH-UA-Model", operation: HeaderOperation.REMOVE },
    { header: "Sec-CH-UA-Platform", operation: HeaderOperation.REMOVE },
    { header: "Sec-CH-UA-Platform-Version", operation: HeaderOperation.REMOVE }
  ];
}

function isTabScopedSiteKey(siteKey: string): boolean {
  return siteKey === FILE_SITE_RULE || siteKey.startsWith("[");
}

function ruleAppliesToTab(rule: chrome.declarativeNetRequest.Rule, tabId: number): boolean {
  return isTabRuleId(rule.id) && rule.condition.tabIds?.includes(tabId) === true;
}

function isGlobalRuleId(id: number): boolean {
  return id >= RULE_ID_BASE && id < RULE_ID_BASE + RULE_ID_RANGE;
}

function isTabRuleId(id: number): boolean {
  return id >= TAB_RULE_ID_BASE && id < TAB_RULE_ID_LIMIT;
}

function isDnrRequestDomain(host: string): boolean {
  return host !== DEFAULT_SITE_RULE
    && host !== FILE_SITE_RULE
    && !host.startsWith("[");
}

function nextRuleId(siteKey: string, usedRuleIds: Set<number>): number {
  let id = RULE_ID_BASE + (Number.parseInt(hashHex(siteKey).slice(0, 5), 16) % RULE_ID_RANGE);
  while (usedRuleIds.has(id)) {
    id += 1;
    if (id >= RULE_ID_BASE + RULE_ID_RANGE) {
      id = RULE_ID_BASE;
    }
  }
  usedRuleIds.add(id);
  return id;
}

function nextTabRuleId(key: string, usedRuleIds: Set<number>): number {
  let id = TAB_RULE_ID_BASE + (Number.parseInt(hashHex(key).slice(0, 5), 16) % RULE_ID_RANGE);
  while (usedRuleIds.has(id)) {
    id += 1;
    if (id >= TAB_RULE_ID_LIMIT) {
      id = TAB_RULE_ID_BASE;
    }
  }
  usedRuleIds.add(id);
  return id;
}

async function validateRules(rules: chrome.declarativeNetRequest.Rule[]): Promise<void> {
  if (regexValidationCache.size > 2048) {
    regexValidationCache.clear();
  }
  if (rules.length > MAX_GHOST_GLOBAL_RULES) {
    throw new Error(`Ghost header rules exceed the supported limit (${rules.length}/${MAX_GHOST_GLOBAL_RULES}).`);
  }
  const regexRules = rules.filter((rule) => typeof rule.condition.regexFilter === "string");
  if (regexRules.length > MAX_GHOST_REGEX_RULES) {
    throw new Error(`Ghost regex rules exceed the supported limit (${regexRules.length}/${MAX_GHOST_REGEX_RULES}).`);
  }
  const regexFilters = [...new Set(regexRules.map((rule) => rule.condition.regexFilter as string))];
  const uncheckedFilters = regexFilters.filter((filter) => !regexValidationCache.has(filter));
  const results = await Promise.all(uncheckedFilters.map(async (regex) => ({
    regex,
    result: await chrome.declarativeNetRequest.isRegexSupported({ regex, requireCapturing: false })
  })));
  for (const { regex, result } of results) {
    if (!result.isSupported) {
      throw new Error(`Unsupported Ghost request rule (${result.reason ?? "invalid regex"}): ${regex}`);
    }
    regexValidationCache.add(regex);
  }
}
