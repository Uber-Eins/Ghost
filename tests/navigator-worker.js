self.postMessage({
  language: navigator.language,
  languages: navigator.languages,
  deviceMemory: navigator.deviceMemory,
  globalPrivacyControl: navigator.globalPrivacyControl,
  platform: navigator.platform,
  userAgent: navigator.userAgent,
  appVersion: navigator.appVersion,
  userAgentData: navigator.userAgentData ? navigator.userAgentData.toJSON() : null,
  location: self.location.href
});
