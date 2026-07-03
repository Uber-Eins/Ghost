const MESSAGES = {
  en: {
    add: "Add",
    addCustomProfile: "Add custom profile",
    advancedToggle: "Use advanced CDP overrides when this build has the debugger permission",
    build: "Build",
    buildAdvanced: "Advanced build: CDP environment overrides are available. DevTools conflicts automatically fall back to lite behavior.",
    buildLite: "Lite build: no debugger permission. JavaScript surfaces and request headers are handled without CDP.",
    disableHour: "Disable for 1 hour",
    excludedDomains: "Excluded Domains",
    fingerprintTest: "Fingerprint test",
    globalProtection: "Global protection",
    ghostOptions: "Ghost Options",
    options: "Options",
    optionsSubtitle: "Profiles, site rules, exclusions, and build behavior.",
    profile: "Profile",
    profiles: "Profiles",
    refresh: "Refresh",
    regenerateProfile: "Regenerate site profile",
    remove: "Remove",
    reset: "Reset",
    resetDone: "Reset",
    saveChanges: "Save changes",
    saved: "Saved",
    site: "Site",
    siteRules: "Site Rules",
    thisSite: "This site",
    unsupportedPage: "Unsupported internal page"
  },
  "zh-CN": {
    add: "添加",
    addCustomProfile: "添加自定义画像",
    advancedToggle: "在此构建拥有 debugger 权限时使用高级 CDP 覆盖",
    build: "构建",
    buildAdvanced: "高级构建：可使用 CDP 环境覆盖。DevTools 冲突时会自动回退到 lite 行为。",
    buildLite: "Lite 构建：无 debugger 权限。通过 JavaScript 表面与请求头规则处理。",
    disableHour: "停用 1 小时",
    excludedDomains: "排除域名",
    fingerprintTest: "指纹测试",
    globalProtection: "全局保护",
    ghostOptions: "Ghost 选项",
    options: "选项",
    optionsSubtitle: "画像、站点规则、排除项与构建行为。",
    profile: "画像",
    profiles: "画像",
    refresh: "刷新",
    regenerateProfile: "重新生成本站画像",
    remove: "移除",
    reset: "重置",
    resetDone: "已重置",
    saveChanges: "保存更改",
    saved: "已保存",
    site: "站点",
    siteRules: "站点规则",
    thisSite: "当前站点",
    unsupportedPage: "不支持的内部页面"
  }
} as const;

type Language = keyof typeof MESSAGES;
export type MessageKey = keyof typeof MESSAGES.en;

export function currentUiLanguage(): Language {
  const language = navigator.language.toLowerCase();
  return language === "zh-cn" || language.startsWith("zh-hans") ? "zh-CN" : "en";
}

export function t(key: MessageKey): string {
  return MESSAGES[currentUiLanguage()][key] ?? MESSAGES.en[key];
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
