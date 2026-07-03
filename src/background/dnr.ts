import { hashHex } from "../shared/hash";
import { runtimeUserAgent, userAgentForProfile, uaPlatformForProfile } from "../shared/profiles";
import { domainMatches } from "../shared/site";
import { headerRulesAllowed, profilesFromSettings } from "../shared/storage";
import type { GhostSettings, Profile } from "../shared/types";

const RULE_ID_BASE = 700000;
const {
  ResourceType,
  RuleActionType,
  HeaderOperation
} = chrome.declarativeNetRequest;

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
  ResourceType.OTHER
];

let dnrRefreshQueue: Promise<void> = Promise.resolve();

export function refreshHeaderRules(settings: GhostSettings): Promise<void> {
  const pending = dnrRefreshQueue.then(() => refreshHeaderRulesNow(settings), () => refreshHeaderRulesNow(settings));
  dnrRefreshQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

async function refreshHeaderRulesNow(settings: GhostSettings): Promise<void> {
  if (!chrome.declarativeNetRequest) {
    return;
  }

  const existingRules = await chrome.declarativeNetRequest.getSessionRules();
  const addRules = headerRulesAllowed(settings) ? buildRules(settings) : [];
  const removeRuleIds = new Set(existingRules
    .map((rule) => rule.id)
    .filter((id) => id >= RULE_ID_BASE && id < RULE_ID_BASE + 100000));
  for (const rule of addRules) {
    removeRuleIds.add(rule.id);
  }

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [...removeRuleIds],
    addRules
  });
}

function buildRules(settings: GhostSettings): chrome.declarativeNetRequest.Rule[] {
  const profiles = profilesFromSettings(settings);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const usedRuleIds = new Set<number>();
  const rules: chrome.declarativeNetRequest.Rule[] = [];
  for (const [siteKey, profileId] of Object.entries(settings.siteProfiles)) {
    const profile = profileById.get(profileId);
    if (!profile || !isDnrDomain(siteKey) || settings.excludedDomains.some((domain) => domainMatches(siteKey, domain))) {
      continue;
    }
    rules.push(ruleForSite(siteKey, profile, usedRuleIds));
  }
  return rules;
}

function isDnrDomain(siteKey: string): boolean {
  return siteKey === "localhost" || siteKey.includes(".") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(siteKey);
}

function ruleForSite(siteKey: string, profile: Profile, usedRuleIds: Set<number>): chrome.declarativeNetRequest.Rule {
  const id = nextRuleId(siteKey, usedRuleIds);
  const nativeUserAgent = runtimeUserAgent();
  return {
    id,
    priority: 1,
    action: {
      type: RuleActionType.MODIFY_HEADERS,
      requestHeaders: [
        { header: "Accept-Language", operation: HeaderOperation.SET, value: profile.acceptLanguage },
        { header: "User-Agent", operation: HeaderOperation.SET, value: userAgentForProfile(profile, nativeUserAgent) },
        { header: "Sec-CH-UA-Platform", operation: HeaderOperation.SET, value: `"${uaPlatformForProfile(profile)}"` },
        { header: "Sec-CH-UA-Mobile", operation: HeaderOperation.SET, value: "?0" },
        { header: "Sec-CH-UA-Arch", operation: HeaderOperation.REMOVE },
        { header: "Sec-CH-UA-Bitness", operation: HeaderOperation.REMOVE },
        { header: "Sec-CH-UA-Full-Version", operation: HeaderOperation.REMOVE },
        { header: "Sec-CH-UA-Full-Version-List", operation: HeaderOperation.REMOVE },
        { header: "Sec-CH-UA-Model", operation: HeaderOperation.REMOVE },
        { header: "Sec-CH-UA-Platform-Version", operation: HeaderOperation.REMOVE }
      ]
    },
    condition: {
      requestDomains: [siteKey],
      resourceTypes: RESOURCE_TYPES
    }
  };
}

function nextRuleId(siteKey: string, usedRuleIds: Set<number>): number {
  let id = RULE_ID_BASE + (Number.parseInt(hashHex(siteKey).slice(0, 5), 16) % 100000);
  while (usedRuleIds.has(id)) {
    id += 1;
    if (id >= RULE_ID_BASE + 100000) {
      id = RULE_ID_BASE;
    }
  }
  usedRuleIds.add(id);
  return id;
}
