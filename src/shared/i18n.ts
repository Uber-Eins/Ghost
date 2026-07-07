const MESSAGES = {
  en: {
    acceptLanguage: "Accept-Language",
    accuracy: "Accuracy",
    actions: "Actions",
    add: "Add",
    addCustomProfile: "Add custom profile",
    addProfile: "Add profile",
    advancedSettings: "Advanced settings",
    advancedToggle: "Use advanced CDP overrides when this build has the debugger permission",
    build: "Build",
    buildAdvanced: "Advanced build: CDP environment overrides are available. DevTools conflicts automatically fall back to lite behavior.",
    buildLite: "Lite build: no debugger permission. JavaScript surfaces and request headers are handled without CDP.",
    buildSubtitle: "Choose the runtime behavior available to this extension build.",
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
    excludedDomains: "Excluded Domains",
    excludedDomainsSubtitle: "Domains listed here keep their native browser environment.",
    fingerprintTest: "Fingerprint test",
    globalProtection: "Global protection",
    ghostOptions: "Ghost Options",
    hardware: "Hardware",
    hardwareConcurrency: "Hardware threads",
    hardwareSummary: "Hardware",
    intlLocale: "Intl locale",
    label: "Label",
    languages: "Languages",
    latitude: "Latitude",
    locale: "Locale",
    location: "Location",
    longitude: "Longitude",
    noExcludedDomains: "No excluded domains.",
    noSiteRules: "No site rules yet.",
    options: "Options",
    optionsSubtitle: "Privacy profiles, site rules, exclusions, and build behavior.",
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
    selectPlatform: "Select platform",
    selectTimezone: "Select timezone",
    site: "Site",
    siteRules: "Site Rules",
    siteRulesSubtitle: "Pinned per-site profile assignments.",
    status: "Status",
    thisSite: "This site",
    timezone: "Timezone",
    timezoneLocation: "Timezone / Location",
    unsupportedPage: "Unsupported internal page",
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
    addProfile: "添加画像",
    advancedSettings: "高级设置",
    advancedToggle: "在此构建拥有 debugger 权限时使用高级 CDP 覆盖",
    build: "构建",
    buildAdvanced: "高级构建：可使用 CDP 环境覆盖。DevTools 冲突时会自动回退到 lite 行为。",
    buildLite: "Lite 构建：无 debugger 权限。通过 JavaScript 表面与请求头规则处理。",
    buildSubtitle: "选择当前扩展构建可用的运行行为。",
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
    excludedDomains: "排除域名",
    excludedDomainsSubtitle: "这里列出的域名将保留浏览器原生环境。",
    fingerprintTest: "指纹测试",
    globalProtection: "全局保护",
    ghostOptions: "Ghost 选项",
    hardware: "硬件",
    hardwareConcurrency: "硬件线程",
    hardwareSummary: "硬件",
    intlLocale: "Intl 区域",
    label: "名称",
    languages: "语言列表",
    latitude: "纬度",
    locale: "区域",
    location: "位置",
    longitude: "经度",
    noExcludedDomains: "暂无排除域名。",
    noSiteRules: "暂无站点规则。",
    options: "选项",
    optionsSubtitle: "隐私画像、站点规则、排除项与构建行为。",
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
    selectPlatform: "选择平台",
    selectTimezone: "选择时区",
    site: "站点",
    siteRules: "站点规则",
    siteRulesSubtitle: "固定的按站点画像分配。",
    status: "状态",
    thisSite: "当前站点",
    timezone: "时区",
    timezoneLocation: "时区 / 位置",
    unsupportedPage: "不支持的内部页面",
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
