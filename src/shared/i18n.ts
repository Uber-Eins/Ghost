const MESSAGES = {
  en: {
    acceptLanguage: "Accept-Language",
    accuracy: "Accuracy",
    actions: "Actions",
    add: "Add",
    addCustomProfile: "Add custom profile",
    addExclusion: "Add exclusion",
    addProfile: "Add profile",
    addSiteRule: "Add site rule",
    advancedSettings: "Advanced settings",
    advancedToggle: "Use advanced CDP overrides when debugger permission is available",
    architecture: "Architecture",
    build: "Global Configuration",
    buildAdvanced: "Advanced overrides: CDP environment overrides are available. DevTools conflicts automatically fall back to lite behavior.",
    buildLite: "Lite mode: no debugger permission. JavaScript surfaces and request headers are handled without CDP.",
    buildSubtitle: "Global protection, UA behavior, and advanced override settings.",
    cancel: "Cancel",
    cannotDeleteLastProfile: "Keep at least one profile available.",
    chooseLocation: "Choose a location",
    coordinates: "Coordinates",
    custom: "Custom",
    customProfileDefaultLabel: "Custom profile",
    delete: "Delete",
    deleteProfile: "Delete profile",
    deviceMemory: "Device memory",
    disableHour: "Disable for 1 hour",
    edit: "Edit",
    editProfile: "Edit profile",
    earlyBootstrapUnavailable: "Using automatic fallback. Enable Allow User Scripts only for protection before page scripts run",
    disableUserAgentSpoofing: "Disable UA spoofing",
    disableUserAgentSpoofingSubtitle: "Leave User-Agent, UA Client Hints, and platform surfaces to the browser or another extension.",
    excludedDomains: "Excluded Domains",
    excludedDomainsSubtitle: "Hosts or host paths listed here keep their native browser environment.",
    exclusionRuleInputLabel: "Excluded host or host path",
    fingerprintTest: "Fingerprint test",
    fingerprintTestExternal: "External fingerprint test",
    fingerprintTestExternalConfirm: "This opens BrowserLeaks, a third-party website that will receive your IP address and browser fingerprint. Continue?",
    fileAccessRequired: "Enable “Allow access to file URLs” in Ghost's extension details, then reload this file.",
    globalConfig: "Global Configuration",
    globalConfigSubtitle: "Global protection, GPC, UA behavior, and advanced override settings.",
    globalPrivacyControl: "Global Privacy Control (GPC)",
    globalPrivacyControlSubtitle: "Send Sec-GPC: 1 and expose navigator.globalPrivacyControl as true on all supported sites.",
    globalProtection: "Global protection",
    globalProtectionSubtitle: "Enable Ghost protections for supported sites.",
    ghostOptions: "Ghost Options",
    hardware: "Hardware",
    hardwareConcurrency: "Hardware threads",
    hardwareSummary: "Hardware",
    intlLocale: "Intl locale",
    invalidExclusionRule: "Enter a valid host or host path, such as example.com/login.",
    invalidSiteRule: "Enter a valid host, such as example.com, or *.",
    label: "Label",
    languages: "Languages",
    latitude: "Latitude",
    locale: "Locale",
    location: "Location",
    longitude: "Longitude",
    noExcludedDomains: "No excluded domains.",
    noSiteRules: "No site rules yet.",
    options: "Options",
    optionsSubtitle: "Privacy profiles, site rules, exclusions, and global behavior.",
    platform: "Platform",
    preset: "Preset",
    profile: "Profile",
    profileDeleted: "Profile deleted",
    profileId: "Profile ID",
    profileSaved: "Profile saved",
    profileSummary: "Summary",
    profiles: "Profiles",
    profilesSubtitle: "Review profiles in a compact table. Edit the full configuration in a focused dialog.",
    refresh: "Refresh",
    regenerateProfile: "Regenerate site profile",
    region: "Region",
    remove: "Remove",
    reset: "Reset",
    resetDone: "Reset",
    saveChanges: "Save changes",
    saveProfile: "Save profile",
    saved: "Saved",
    selectLocale: "Select locale",
    selectArchitecture: "Select architecture",
    selectPlatform: "Select platform",
    selectTimezone: "Select timezone",
    site: "Site",
    siteRuleInputLabel: "Site rule host",
    siteRules: "Site Rules",
    siteRulePlaceholder: "* or example.com",
    siteRulesSubtitle: "Host rules use suffix matching; * is the default for all domains.",
    settingsLimitReached: "The safe rule limit has been reached. Remove an existing entry first.",
    status: "Status",
    thisSite: "This site",
    timezone: "Timezone",
    timezoneLocation: "Timezone / Location",
    unsupportedPage: "Unsupported internal page",
    userAgent: "User-Agent",
    webglRenderer: "WebGL renderer",
    webglSummary: "WebGL",
    webglVendor: "WebGL vendor"
  },
  "zh-CN": {
    acceptLanguage: "Accept-Language",
    accuracy: "精度",
    actions: "操作",
    add: "添加",
    addCustomProfile: "添加自定义画像",
    addExclusion: "添加排除项",
    addProfile: "添加画像",
    addSiteRule: "添加站点规则",
    advancedSettings: "高级设置",
    advancedToggle: "在 debugger 权限可用时使用高级 CDP 覆盖",
    architecture: "架构",
    build: "全局配置",
    buildAdvanced: "高级覆盖：可使用 CDP 环境覆盖。DevTools 冲突时会自动回退到 lite 行为。",
    buildLite: "Lite 模式：无 debugger 权限。通过 JavaScript 表面与请求头规则处理。",
    buildSubtitle: "全局保护、UA 行为与高级覆盖设置。",
    cancel: "取消",
    cannotDeleteLastProfile: "至少需要保留一个可用画像。",
    chooseLocation: "选择位置",
    coordinates: "坐标",
    custom: "自定义",
    customProfileDefaultLabel: "自定义画像",
    delete: "删除",
    deleteProfile: "删除画像",
    deviceMemory: "设备内存",
    disableHour: "停用 1 小时",
    edit: "编辑",
    editProfile: "编辑画像",
    earlyBootstrapUnavailable: "当前使用自动回退；仅需在希望页面脚本运行前完成保护时启用“允许用户脚本”",
    disableUserAgentSpoofing: "禁用 UA 伪装",
    disableUserAgentSpoofingSubtitle: "User-Agent、UA Client Hints 与平台信息交给浏览器或其他扩展处理。",
    excludedDomains: "排除域名",
    excludedDomainsSubtitle: "这里列出的主机或主机路径将保留浏览器原生环境。",
    exclusionRuleInputLabel: "要排除的主机或主机路径",
    fingerprintTest: "指纹测试",
    fingerprintTestExternal: "外部指纹测试",
    fingerprintTestExternalConfirm: "即将打开第三方网站 BrowserLeaks；该网站将收到你的 IP 地址和浏览器指纹。是否继续？",
    fileAccessRequired: "请在 Ghost 的扩展详情中启用“允许访问文件网址”，然后重新加载此文件。",
    globalConfig: "全局配置",
    globalConfigSubtitle: "全局保护、GPC、UA 行为与高级覆盖设置。",
    globalPrivacyControl: "全局隐私控制（GPC）",
    globalPrivacyControlSubtitle: "向所有受支持站点发送 Sec-GPC: 1，并将 navigator.globalPrivacyControl 设为 true。",
    globalProtection: "全局保护",
    globalProtectionSubtitle: "为受支持站点启用 Ghost 保护。",
    ghostOptions: "Ghost 选项",
    hardware: "硬件",
    hardwareConcurrency: "硬件线程",
    hardwareSummary: "硬件",
    intlLocale: "Intl 区域",
    invalidExclusionRule: "请输入有效的主机或主机路径，例如 example.com/login。",
    invalidSiteRule: "请输入有效的主机，例如 example.com，或 *。",
    label: "名称",
    languages: "语言列表",
    latitude: "纬度",
    locale: "区域",
    location: "位置",
    longitude: "经度",
    noExcludedDomains: "暂无排除域名。",
    noSiteRules: "暂无站点规则。",
    options: "选项",
    optionsSubtitle: "隐私画像、站点规则、排除项与全局行为。",
    platform: "平台",
    preset: "预设",
    profile: "画像",
    profileDeleted: "画像已删除",
    profileId: "画像 ID",
    profileSaved: "画像已保存",
    profileSummary: "摘要",
    profiles: "画像",
    profilesSubtitle: "用紧凑表格浏览画像，在弹窗中编辑完整配置。",
    refresh: "刷新",
    regenerateProfile: "重新生成本站画像",
    region: "地域",
    remove: "移除",
    reset: "重置",
    resetDone: "已重置",
    saveChanges: "保存更改",
    saveProfile: "保存画像",
    saved: "已保存",
    selectLocale: "选择区域",
    selectArchitecture: "选择架构",
    selectPlatform: "选择平台",
    selectTimezone: "选择时区",
    site: "站点",
    siteRuleInputLabel: "站点规则主机",
    siteRules: "站点规则",
    siteRulePlaceholder: "* 或 example.com",
    siteRulesSubtitle: "主机规则使用后缀匹配；* 默认匹配所有域名。",
    settingsLimitReached: "已达到安全规则上限，请先移除现有条目。",
    status: "状态",
    thisSite: "当前站点",
    timezone: "时区",
    timezoneLocation: "时区 / 位置",
    unsupportedPage: "不支持的内部页面",
    userAgent: "User-Agent",
    webglRenderer: "WebGL 渲染器",
    webglSummary: "WebGL",
    webglVendor: "WebGL 供应商"
  }
} as const;

type Language = keyof typeof MESSAGES;
export type MessageKey = keyof typeof MESSAGES.en;

export function currentUiLanguage(): Language {
  const language = chromeUiLanguage().toLowerCase();
  return language === "zh-cn" || language.startsWith("zh-hans") ? "zh-CN" : "en";
}

export function t(key: MessageKey): string {
  return chromeMessage(key) ?? MESSAGES[currentUiLanguage()][key] ?? MESSAGES.en[key];
}

export function localizeDocument(): void {
  const language = currentUiLanguage();
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n as MessageKey | undefined;
    if (key) {
      element.textContent = t(key);
    }
  }
  for (const element of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    const key = element.dataset.i18nPlaceholder as MessageKey | undefined;
    if (key) {
      element.placeholder = t(key);
    }
  }
}

function chromeUiLanguage(): string {
  if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }
  return navigator.language;
}

function chromeMessage(key: MessageKey): string | undefined {
  if (typeof chrome === "undefined" || !chrome.i18n?.getMessage) {
    return undefined;
  }
  const message = chrome.i18n.getMessage(key);
  return message || undefined;
}
