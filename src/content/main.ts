import { stableNumber, stableSeed } from "../shared/hash";
import { canvasFontHasBlockedFamily, sanitizeCanvasFont } from "../shared/fonts";
import { constructDateWithNewTarget } from "../shared/date-constructor";
import { isSupportedPageUrl } from "../shared/internal";
import { appVersionForProfile, fallbackProfileForSite, navigatorPlatformForProfile, navigatorVendorForProfile, userAgentForProfile, userAgentMetadataForProfile, webgpuAdapterInfoForProfile } from "../shared/profiles";
import { DEFAULT_EXCLUDED_DOMAINS, DEFAULT_SITE_RULE, isExcludedUrl, siteKeyFromUrl } from "../shared/site";
import {
  dateFromZonedLocalParts,
  formatSpoofedTimeString,
  getOffsetLabel,
  getTimezoneOffsetMinutes,
  getZonedParts
} from "../shared/timezone";
import { DEFAULT_SETTINGS, normalizeSettings, resolveProfile } from "../shared/storage";
import type { BuildTarget, GhostSettings, Profile, ResolvedProfile } from "../shared/types";

declare const __GHOST_CHANNEL__: string;
declare const __GHOST_BUILD__: BuildTarget;
declare const __GHOST_RELATED_ONLY__: boolean;

interface GhostState {
  enabled: boolean;
  globalPrivacyControlEnabled: boolean;
  uaSpoofingEnabled: boolean;
  canvasMeasureTextSpoofingEnabled: boolean;
  webglInfoSpoofingEnabled: boolean;
  siteKey: string;
  seed: string;
  profile: Profile;
}

interface IntlInstanceMetadata {
  locale?: string;
  timeZone?: string;
}

interface BootstrapPayload {
  build?: BuildTarget;
  settings?: GhostSettings;
}

interface GhostController {
  readonly installed: true;
}

interface NavigatorDescriptorSnapshot {
  owner: object;
  descriptor: PropertyDescriptor;
}

const ghostGlobal = globalThis as typeof globalThis & {
  __GHOST_BOOTSTRAP_SETTINGS__?: BootstrapPayload;
  __GHOST_PAGE_CONTROLLER__?: GhostController;
};

ghostControllerInitialization: {
if (__GHOST_RELATED_ONLY__ && isSupportedPageUrl(location.href)) {
  break ghostControllerInitialization;
}
const existingController = ghostGlobal.__GHOST_PAGE_CONTROLLER__;
const pendingBootstrap = takeBootstrapPayload();
if (existingController) {
  break ghostControllerInitialization;
}

const NativeDate = Date;
const NativeIntl = {
  DateTimeFormat: Intl.DateTimeFormat,
  NumberFormat: Intl.NumberFormat,
  Collator: Intl.Collator,
  PluralRules: Intl.PluralRules,
  RelativeTimeFormat: Intl.RelativeTimeFormat,
  ListFormat: Intl.ListFormat,
  DisplayNames: Intl.DisplayNames,
  Segmenter: Intl.Segmenter
};
const nativeNavigatorDescriptors = snapshotNavigatorDescriptors([
  "language",
  "languages",
  "platform",
  "vendor",
  "userAgent",
  "appVersion",
  "userAgentData",
  "deviceMemory",
  "globalPrivacyControl"
]);
const nativeNavigator = snapshotNavigator();
const nativeGeolocation = navigator.geolocation;
const initialPageUrl = currentGhostPageUrl();
const initialTopLevelUrl = currentTopLevelGhostPageUrl(initialPageUrl);
const fallbackSiteKey = siteKeyFromUrl(initialTopLevelUrl);
const bootstrapProfile = pendingBootstrap
  ? resolveBootstrapPayload(pendingBootstrap, initialPageUrl, initialTopLevelUrl)
  : null;
const fallbackProfile = bootstrapProfile?.profile ?? fallbackProfileForSite(DEFAULT_SITE_RULE);
const initialEnabled = bootstrapProfile?.enabled ?? (initialPageUrl ? !isExcludedUrl(initialPageUrl, DEFAULT_EXCLUDED_DOMAINS) : false);
const initialGlobalPrivacyControlEnabled = bootstrapProfile?.globalPrivacyControlEnabled
  ?? DEFAULT_SETTINGS.globalPrivacyControlEnabled;
const initialUserAgentSpoofingEnabled = bootstrapProfile?.uaSpoofingEnabled ?? initialEnabled;
const initialCanvasMeasureTextSpoofingEnabled = bootstrapProfile?.canvasMeasureTextSpoofingEnabled ?? initialEnabled;
const initialWebglInfoSpoofingEnabled = bootstrapProfile?.webglInfoSpoofingEnabled ?? initialEnabled;
const initialSiteKey = bootstrapProfile?.siteKey ?? fallbackSiteKey;
const initialSeed = bootstrapProfile?.seed ?? stableSeed(fallbackSiteKey, fallbackProfile.id);
const state: GhostState = {
  enabled: initialEnabled,
  globalPrivacyControlEnabled: initialGlobalPrivacyControlEnabled,
  uaSpoofingEnabled: initialUserAgentSpoofingEnabled,
  canvasMeasureTextSpoofingEnabled: initialCanvasMeasureTextSpoofingEnabled,
  webglInfoSpoofingEnabled: initialWebglInfoSpoofingEnabled,
  siteKey: initialSiteKey,
  profile: fallbackProfile,
  seed: initialSeed
};
const installedSurfaceOwnership = Object.freeze({
  profileProtection: state.enabled,
  userAgent: state.uaSpoofingEnabled,
  canvasMeasureText: state.canvasMeasureTextSpoofingEnabled,
  webglInfo: state.webglInfoSpoofingEnabled
});
const initialProfileSignature = profileSignature(fallbackProfile);
const intlInstanceMetadata = new WeakMap<object, IntlInstanceMetadata>();
// Every replaced built-in is registered against the native it wraps so that
// Function.prototype.toString keeps printing the original native source. A
// wrapper whose toString exposes JavaScript is the cheapest tamper signal a
// page can look for. Declared before the install sequence below runs.
const nativeFunctionSources = new WeakMap<object, Function>();
const bridgeNonce = createNonce();
let bridgePort: MessagePort | null = null;
let bridgeConnected = false;
let bridgeConnectAttempts = 0;
const pendingBridgePorts = new Set<MessagePort>();
let profileRequestSeq = 0;
let latestProfileRequestId = 0;
let hasResolvedProfile = bootstrapProfile !== null;
let restoredPageNeedsReload = false;
const reloadOnProfileChangeRequestIds = new Set<number>();
let cachedUserAgentData: { key: string; value: object } | null = null;
let cachedLanguages: { key: string; value: readonly string[] } | null = null;
const synchronizedChildNavigators = new WeakSet<object>();

Object.defineProperty(ghostGlobal, "__GHOST_PAGE_CONTROLLER__", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: Object.freeze({ installed: true as const })
});

if (initialPageUrl) {
  install();
  connectBridge();
}

function applyResolvedProfile(resolved: ResolvedProfile, requestId: number): void {
  const shouldReload = reloadOnProfileChangeRequestIds.delete(requestId) && profileChanged(resolved);
  const surfaceOwnershipChanged = (
    installedSurfaceOwnership.profileProtection !== resolved.enabled
    || installedSurfaceOwnership.userAgent !== resolved.uaSpoofingEnabled
    || installedSurfaceOwnership.canvasMeasureText !== resolved.canvasMeasureTextSpoofingEnabled
    || installedSurfaceOwnership.webglInfo !== resolved.webglInfoSpoofingEnabled
  );
  state.enabled = resolved.enabled;
  state.globalPrivacyControlEnabled = resolved.globalPrivacyControlEnabled;
  state.uaSpoofingEnabled = resolved.uaSpoofingEnabled;
  state.canvasMeasureTextSpoofingEnabled = resolved.canvasMeasureTextSpoofingEnabled;
  state.webglInfoSpoofingEnabled = resolved.webglInfoSpoofingEnabled;
  state.siteKey = resolved.siteKey;
  state.profile = resolved.profile;
  state.seed = resolved.seed;
  cachedUserAgentData = null;
  cachedLanguages = null;
  hasResolvedProfile = true;
  if (shouldReload || surfaceOwnershipChanged) {
    location.reload();
    return;
  }
  if (installedSurfaceOwnership.userAgent) {
    syncUserAgentDataDescriptor();
  }
  if (
    initialEnabled !== resolved.enabled
    || initialGlobalPrivacyControlEnabled !== resolved.globalPrivacyControlEnabled
    || initialUserAgentSpoofingEnabled !== resolved.uaSpoofingEnabled
    || initialCanvasMeasureTextSpoofingEnabled !== resolved.canvasMeasureTextSpoofingEnabled
    || initialWebglInfoSpoofingEnabled !== resolved.webglInfoSpoofingEnabled
    || initialSiteKey !== resolved.siteKey
    || initialSeed !== resolved.seed
    || initialProfileSignature !== profileSignature(resolved.profile)
  ) {
    restoredPageNeedsReload = true;
  }
}

function install(): void {
  if ((window as unknown as { __ghostInstalled?: boolean }).__ghostInstalled) {
    return;
  }
  (window as unknown as { __ghostInstalled?: boolean }).__ghostInstalled = true;

  patchFunctionToString();
  patchGlobalPrivacyControl();
  if (!installedSurfaceOwnership.profileProtection) {
    // Excluded documents (including Turnstile challenge frames) must keep
    // profile-related prototypes native. GPC remains an independent signal.
    return;
  }
  patchNavigator();
  patchIframeNavigatorAccess();
  patchIntl();
  patchDate();
  patchGeolocation();
  patchFontFaceSet();
  if (installedSurfaceOwnership.canvasMeasureText) {
    patchCanvas();
  }
  if (installedSurfaceOwnership.webglInfo) {
    patchWebGL();
    patchWebGPU();
    patchWorkers();
  }
}

function connectBridge(): void {
  if (installedSurfaceOwnership.profileProtection) {
    installNavigationRefresh();
  }
  requestBridgeConnection();
}

function requestBridgeConnection(): void {
  if (bridgeConnected) {
    return;
  }
  bridgeConnectAttempts += 1;
  const channel = new MessageChannel();
  const activePort = channel.port1;
  pendingBridgePorts.add(activePort);
  activePort.onmessage = (event) => {
    const data = event.data as { channel?: string; type?: string; nonce?: string; requestId?: number; payload?: unknown } | null;
    if (!data || data.channel !== __GHOST_CHANNEL__ || data.nonce !== bridgeNonce) {
      return;
    }
    if (data.type === "connected") {
      if (bridgeConnected) {
        activePort.close();
        pendingBridgePorts.delete(activePort);
        return;
      }
      bridgeConnected = true;
      bridgePort = activePort;
      for (const pendingPort of pendingBridgePorts) {
        if (pendingPort !== activePort) {
          pendingPort.close();
        }
      }
      pendingBridgePorts.clear();
      requestResolvedProfile();
      return;
    }
    if (activePort !== bridgePort) {
      return;
    }
    if (data.type === "refresh") {
      requestResolvedProfile(true);
      return;
    }
    if (data.type !== "profile") {
      return;
    }
    const requestId = typeof data.requestId === "number" ? data.requestId : 0;
    if (requestId !== latestProfileRequestId) {
      reloadOnProfileChangeRequestIds.delete(requestId);
      return;
    }
    bridgeConnected = true;
    bridgePort = activePort;
    applyResolvedProfile(data.payload as ResolvedProfile, requestId);
  };
  activePort.start();
  window.postMessage({
    channel: __GHOST_CHANNEL__,
    type: "connect",
    nonce: bridgeNonce
  }, "*", [channel.port2]);
  if (!bridgeConnected && bridgeConnectAttempts < 8) {
    const retryDelay = Math.min(1000, 25 * (2 ** (bridgeConnectAttempts - 1)));
    window.setTimeout(() => {
      if (!bridgeConnected) {
        requestBridgeConnection();
      }
    }, retryDelay);
  } else if (!bridgeConnected) {
    window.setTimeout(() => {
      if (!bridgeConnected) {
        for (const pendingPort of pendingBridgePorts) {
          pendingPort.close();
        }
        pendingBridgePorts.clear();
      }
    }, 1000);
  }
}

function requestResolvedProfile(reloadOnProfileChange = false): void {
  if (!bridgePort) {
    return;
  }
  profileRequestSeq += 1;
  const requestId = profileRequestSeq;
  latestProfileRequestId = requestId;
  reloadOnProfileChangeRequestIds.clear();
  if (reloadOnProfileChange) {
    reloadOnProfileChangeRequestIds.add(requestId);
  }
  try {
    bridgePort?.postMessage({
      channel: __GHOST_CHANNEL__,
      type: "resolve",
      nonce: bridgeNonce,
      requestId
    });
  } catch {
    bridgeConnected = false;
    bridgePort = null;
    requestBridgeConnection();
  }
}

function installNavigationRefresh(): void {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && restoredPageNeedsReload) {
      location.reload();
      return;
    }
    requestResolvedProfile(true);
  });
  window.addEventListener("popstate", () => requestResolvedProfile(true));
  window.addEventListener("hashchange", () => requestResolvedProfile(true));
  patchHistoryMethod("pushState");
  patchHistoryMethod("replaceState");
}

function patchHistoryMethod(method: "pushState" | "replaceState"): void {
  const native = history[method];
  if (typeof native !== "function") {
    return;
  }
  try {
    Object.defineProperty(history, method, {
      configurable: true,
      writable: true,
      value: maskAsNative(function historyMethod(this: History, ...args: Parameters<History["pushState"]>) {
        const result = native.apply(this, args);
        queueMicrotask(() => requestResolvedProfile(true));
        return result;
      }, native)
    });
  } catch {
    // Some pages make history methods non-configurable.
  }
}

function profileSignature(profile: Profile): string {
  return JSON.stringify([
    profile.id,
    profile.locale,
    profile.intlLocale,
    profile.languages,
    profile.timezoneId,
    profile.latitude,
    profile.longitude,
    profile.accuracy,
    profile.acceptLanguage,
    profile.platform,
    profile.architecture,
    profile.platformVersion,
    profile.userAgent,
    profile.uaMode,
    profile.deviceMemory,
    profile.webglVendor,
    profile.webglRenderer
  ]);
}

function profileChanged(resolved: ResolvedProfile): boolean {
  return hasResolvedProfile && (
    state.enabled !== resolved.enabled
    || state.globalPrivacyControlEnabled !== resolved.globalPrivacyControlEnabled
    || state.uaSpoofingEnabled !== resolved.uaSpoofingEnabled
    || state.canvasMeasureTextSpoofingEnabled !== resolved.canvasMeasureTextSpoofingEnabled
    || state.webglInfoSpoofingEnabled !== resolved.webglInfoSpoofingEnabled
    || state.siteKey !== resolved.siteKey
    || state.seed !== resolved.seed
    || profileSignature(state.profile) !== profileSignature(resolved.profile)
  );
}

function takeBootstrapPayload(): BootstrapPayload | undefined {
  const payload = ghostGlobal.__GHOST_BOOTSTRAP_SETTINGS__;
  try {
    delete ghostGlobal.__GHOST_BOOTSTRAP_SETTINGS__;
  } catch {
    ghostGlobal.__GHOST_BOOTSTRAP_SETTINGS__ = undefined;
  }
  return payload;
}

function resolveBootstrapPayload(
  payload: BootstrapPayload | undefined,
  pageUrl: string,
  topLevelUrl: string
): ResolvedProfile | null {
  if (!payload?.settings || !pageUrl) {
    return null;
  }
  const build = payload.build === "advanced" ? "advanced" : __GHOST_BUILD__;
  return resolveProfile(pageUrl, normalizeSettings(payload.settings), build, Date.now(), topLevelUrl);
}

function currentTopLevelGhostPageUrl(fallbackUrl: string): string {
  try {
    const topUrl = window.top?.location.href;
    if (topUrl && isSupportedPageUrl(topUrl)) {
      return topUrl;
    }
  } catch {
    // Cross-origin top frames are exposed through Chromium's read-only
    // ancestorOrigins list instead.
  }

  try {
    const { ancestorOrigins } = location;
    const topOrigin = ancestorOrigins?.length > 0
      ? ancestorOrigins.item(ancestorOrigins.length - 1)
      : null;
    if (topOrigin && isSupportedPageUrl(`${topOrigin}/`)) {
      return `${topOrigin}/`;
    }
  } catch {
    // Fall back to the current/referrer-derived URL for related frames.
  }

  return fallbackUrl;
}

function currentGhostPageUrl(): string {
  if (isSupportedPageUrl(location.href)) {
    return location.href;
  }
  if (isSupportedPageUrl(document.referrer)) {
    return document.referrer;
  }
  try {
    const origin = location.origin;
    return /^https?:\/\//.test(origin) ? `${origin}/` : "";
  } catch {
    return "";
  }
}

function snapshotNavigator(): Record<string, unknown> {
  const nav = navigator as unknown as Record<string, unknown>;
  return {
    language: nav.language,
    languages: Array.isArray(nav.languages) ? [...nav.languages] : nav.languages,
    platform: nav.platform,
    vendor: nav.vendor,
    userAgent: nav.userAgent,
    appVersion: nav.appVersion,
    userAgentData: nav.userAgentData,
    deviceMemory: nav.deviceMemory,
    globalPrivacyControl: nav.globalPrivacyControl
  };
}

function snapshotNavigatorDescriptors(properties: string[]): Map<string, NavigatorDescriptorSnapshot> {
  const descriptors = new Map<string, NavigatorDescriptorSnapshot>();
  for (const property of properties) {
    const owner = findDescriptorOwner(Navigator.prototype, property) ?? navigator;
    const descriptor = Object.getOwnPropertyDescriptor(owner, property);
    if (descriptor) {
      descriptors.set(property, { owner, descriptor });
    }
  }
  return descriptors;
}

function readNativeNavigatorProperty(property: string): unknown {
  const snapshot = nativeNavigatorDescriptors.get(property);
  if (snapshot) {
    if (typeof snapshot.descriptor.get === "function") {
      try {
        return snapshot.descriptor.get.call(navigator);
      } catch {
        return nativeNavigator[property];
      }
    }
    if ("value" in snapshot.descriptor) {
      return snapshot.descriptor.value;
    }
  }
  return nativeNavigator[property];
}

function spoofingBaseUserAgentString(): string {
  return String(nativeNavigator.userAgent ?? "");
}

function maskAsNative<T>(wrapper: T, native: unknown): T {
  if (typeof native === "function" && (typeof wrapper === "function" || (typeof wrapper === "object" && wrapper !== null))) {
    nativeFunctionSources.set(wrapper as object, native);
  }
  return wrapper;
}

function patchFunctionToString(): void {
  const nativeToString = Function.prototype.toString;
  const maskedToString = function toString(this: unknown): string {
    const source = (typeof this === "function" || (typeof this === "object" && this !== null))
      ? nativeFunctionSources.get(this as object)
      : undefined;
    return Reflect.apply(nativeToString, source ?? this, []) as string;
  };
  nativeFunctionSources.set(maskedToString, nativeToString);
  try {
    Object.defineProperty(Function.prototype, "toString", {
      configurable: true,
      writable: true,
      value: maskedToString
    });
  } catch {
    // Leave toString native if the page froze Function.prototype.
  }
}

function patchGlobalPrivacyControl(): void {
  defineNavigatorGetter("globalPrivacyControl", function globalPrivacyControl() {
    if (state.globalPrivacyControlEnabled) {
      return true;
    }
    return Boolean(readNativeNavigatorProperty("globalPrivacyControl"));
  });
}

function patchNavigator(): void {
  defineNavigatorGetter("language", () => state.enabled ? state.profile.locale : readNativeNavigatorProperty("language"));
  defineNavigatorGetter("languages", () => state.enabled ? profileLanguages() : readNativeNavigatorProperty("languages"));
  defineNavigatorGetter("deviceMemory", () => state.enabled ? state.profile.deviceMemory : readNativeNavigatorProperty("deviceMemory"));
  if (installedSurfaceOwnership.userAgent) {
    defineNavigatorGetter("platform", () => navigatorPlatformForProfile(state.profile, spoofingBaseUserAgentString()));
    defineNavigatorGetter("vendor", () => navigatorVendorForProfile(state.profile, spoofingBaseUserAgentString()));
    defineNavigatorGetter("userAgent", () => userAgentForProfile(state.profile, spoofingBaseUserAgentString()));
    defineNavigatorGetter("appVersion", () => appVersionForProfile(state.profile, spoofingBaseUserAgentString()));
    syncUserAgentDataDescriptor();
  }
}

function patchIframeNavigatorAccess(): void {
  const prototype = window.HTMLIFrameElement?.prototype;
  if (!prototype) {
    return;
  }

  const contentWindowDescriptor = Object.getOwnPropertyDescriptor(prototype, "contentWindow");
  const nativeGetContentWindow = contentWindowDescriptor?.get;
  if (contentWindowDescriptor && nativeGetContentWindow) {
    const wrappedGetter = maskAsNative(new Proxy(nativeGetContentWindow, {
      apply(target, thisArgument, argumentsList) {
        const childWindow = Reflect.apply(target, thisArgument, argumentsList) as Window | null;
        synchronizeChildNavigator(childWindow);
        return childWindow;
      }
    }), nativeGetContentWindow);
    try {
      Object.defineProperty(prototype, "contentWindow", {
        ...contentWindowDescriptor,
        get: wrappedGetter
      });
    } catch {
      // Other iframe entry points and all-frame injection still provide coverage.
    }
  }

  const contentDocumentDescriptor = Object.getOwnPropertyDescriptor(prototype, "contentDocument");
  const nativeGetContentDocument = contentDocumentDescriptor?.get;
  if (contentDocumentDescriptor && nativeGetContentDocument) {
    const wrappedGetter = maskAsNative(new Proxy(nativeGetContentDocument, {
      apply(target, thisArgument, argumentsList) {
        const childDocument = Reflect.apply(target, thisArgument, argumentsList) as Document | null;
        synchronizeChildNavigator(childDocument?.defaultView ?? null);
        return childDocument;
      }
    }), nativeGetContentDocument);
    try {
      Object.defineProperty(prototype, "contentDocument", {
        ...contentDocumentDescriptor,
        get: wrappedGetter
      });
    } catch {
      // Other iframe entry points and all-frame injection still provide coverage.
    }
  }
}

function synchronizeChildNavigator(childWindow: Window | null): void {
  if (!childWindow || childWindow === window) {
    return;
  }

  try {
    const childGlobal = childWindow as Window & typeof globalThis;
    const childNavigator = childGlobal.navigator;
    // A related about:blank/srcdoc frame can install Ghost with fallback
    // settings before it receives the parent's resolved profile. Its controller
    // therefore must not prevent the parent from synchronizing direct access.
    if (!childNavigator || synchronizedChildNavigators.has(childNavigator)) {
      return;
    }
    const childPrototype = Object.getPrototypeOf(childNavigator) as object | null;
    if (!childPrototype) {
      return;
    }

    let languagesCache: { key: string; value: readonly string[] } | null = null;
    const properties = [
      "language",
      "languages",
      "deviceMemory",
      "globalPrivacyControl",
      ...(installedSurfaceOwnership.userAgent
        ? ["platform", "vendor", "userAgent", "appVersion", "userAgentData"]
        : [])
    ];
    for (const property of properties) {
      const mainNavigator = navigator as unknown as Record<string, unknown>;
      if (!(property in mainNavigator)) {
        const owner = findDescriptorOwner(childPrototype, property);
        if (owner) {
          try {
            delete (owner as Record<string, unknown>)[property];
          } catch {
            // Ignore a locked child-realm descriptor.
          }
        }
        continue;
      }

      const owner = findDescriptorOwner(childPrototype, property) ?? childPrototype;
      const descriptor = Object.getOwnPropertyDescriptor(owner, property);
      const mirroredValue = (): unknown => {
        const value = mainNavigator[property];
        if (property !== "languages" || !Array.isArray(value)) {
          return value;
        }
        const key = JSON.stringify(value);
        if (languagesCache?.key !== key) {
          const childLanguages = childGlobal.Array.from(value) as string[];
          languagesCache = {
            key,
            value: childGlobal.Object.freeze(childLanguages)
          };
        }
        return languagesCache.value;
      };
      const getter = descriptor?.get
        ? nativeLookingGetter(descriptor.get, mirroredValue)
        : mirroredValue;
      try {
        Object.defineProperty(owner, property, {
          configurable: true,
          enumerable: descriptor?.enumerable ?? true,
          get: getter
        });
      } catch {
        try {
          Object.defineProperty(childNavigator, property, {
            configurable: true,
            enumerable: descriptor?.enumerable ?? true,
            get: getter
          });
        } catch {
          // Some child realms lock selected navigator fields.
        }
      }
    }
    synchronizedChildNavigators.add(childNavigator);
  } catch {
    // Cross-origin frame globals are intentionally inaccessible to the parent.
  }
}

function profileLanguages(): readonly string[] {
  const key = JSON.stringify(state.profile.languages);
  if (cachedLanguages?.key !== key) {
    cachedLanguages = { key, value: Object.freeze([...state.profile.languages]) };
  }
  return cachedLanguages.value;
}

function defineNavigatorGetter(property: string, getter: () => unknown): void {
  const snapshot = nativeNavigatorDescriptors.get(property);
  const owner = snapshot?.owner ?? findDescriptorOwner(Navigator.prototype, property) ?? Navigator.prototype;
  const descriptor = snapshot?.descriptor ?? Object.getOwnPropertyDescriptor(owner, property);
  const installedGetter = descriptor?.get
    ? nativeLookingGetter(descriptor.get, getter)
    : getter;
  try {
    Object.defineProperty(owner, property, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get: installedGetter
    });
  } catch {
    try {
      Object.defineProperty(navigator, property, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get: installedGetter
      });
    } catch {
      // Some Chromium builds keep selected navigator fields locked.
    }
  }
}

function nativeLookingGetter(nativeGetter: () => unknown, value: () => unknown): () => unknown {
  return maskAsNative(new Proxy(nativeGetter, {
    apply(target, thisArgument, argumentsList) {
      // Preserve the native getter's receiver validation before substituting
      // the configured value. Proxies stringify with a native-code surface.
      Reflect.apply(target, thisArgument, argumentsList);
      return value();
    }
  }), nativeGetter);
}

function syncUserAgentDataDescriptor(): void {
  if (state.uaSpoofingEnabled && !userAgentMetadataForProfile(state.profile, spoofingBaseUserAgentString())) {
    hideNavigatorProperty("userAgentData");
    return;
  }
  defineNavigatorGetter("userAgentData", () => state.uaSpoofingEnabled ? buildUserAgentData() : readNativeNavigatorProperty("userAgentData"));
}

function hideNavigatorProperty(property: string): void {
  const snapshot = nativeNavigatorDescriptors.get(property);
  const owner = snapshot?.owner ?? findDescriptorOwner(Navigator.prototype, property) ?? Navigator.prototype;
  try {
    delete (navigator as unknown as Record<string, unknown>)[property];
  } catch {
    // Ignore locked instance properties.
  }
  let deleted = false;
  try {
    deleted = delete (owner as Record<string, unknown>)[property];
  } catch {
    deleted = false;
  }
  if (!deleted) {
    try {
      Object.defineProperty(owner, property, {
        configurable: true,
        enumerable: false,
        get: () => undefined
      });
    } catch {
      // Some Chromium builds keep selected navigator fields locked.
    }
  }
}

function buildUserAgentData(): object | undefined {
  const metadata = userAgentMetadataForProfile(state.profile, spoofingBaseUserAgentString());
  if (!metadata) {
    return undefined;
  }
  const cacheKey = JSON.stringify([profileSignature(state.profile), spoofingBaseUserAgentString()]);
  if (cachedUserAgentData?.key === cacheKey) {
    return cachedUserAgentData.value;
  }
  const metadataRecord = metadata as unknown as Record<string, unknown>;
  const brands = Object.freeze(metadata.brands.map((brand) => Object.freeze({ ...brand })));
  const nativeUaDataPrototype = (window as unknown as { NavigatorUAData?: { prototype: Record<string, unknown> } }).NavigatorUAData?.prototype;
  const value = Object.create(nativeUaDataPrototype ?? Object.prototype) as Record<string, unknown>;
  Object.defineProperties(value, {
    brands: { value: brands, enumerable: true },
    mobile: { value: metadata.mobile, enumerable: true },
    platform: { value: metadata.platform, enumerable: true },
    getHighEntropyValues: {
      value: maskAsNative(async function getHighEntropyValues(hints: string[]) {
        const values: Record<string, unknown> = {
          brands: cloneJson(metadata.brands),
          mobile: metadata.mobile,
          platform: metadata.platform
        };
        for (const hint of hints) {
          if (hint in metadataRecord) {
            values[hint] = cloneJson(metadataRecord[hint]);
          }
        }
        return values;
      }, nativeUaDataPrototype?.getHighEntropyValues)
    },
    toJSON: {
      value: maskAsNative(function toJSON() {
        return {
          brands: cloneJson(metadata.brands),
          mobile: metadata.mobile,
          platform: metadata.platform
        };
      }, nativeUaDataPrototype?.toJSON)
    }
  });
  Object.freeze(value);
  cachedUserAgentData = { key: cacheKey, value };
  return value;
}

function patchIntl(): void {
  patchIntlConstructor("DateTimeFormat", "timeZone");
  patchIntlConstructor("NumberFormat");
  patchIntlConstructor("Collator");
  patchIntlConstructor("PluralRules");
  patchIntlConstructor("RelativeTimeFormat");
  patchIntlConstructor("ListFormat");
  patchIntlConstructor("DisplayNames");
  patchIntlConstructor("Segmenter");
}

function patchIntlConstructor(name: keyof typeof NativeIntl, timeZoneOption?: "timeZone"): void {
  const NativeConstructor = NativeIntl[name] as unknown as new (...args: unknown[]) => object;
  if (typeof NativeConstructor !== "function") {
    return;
  }

  const Wrapped = function IntlWrapper(this: object, locales?: unknown, options?: Record<string, unknown>) {
    const metadata: IntlInstanceMetadata = {};
    const shouldDefaultLocale = state.enabled && locales === undefined;
    const nextLocales = shouldDefaultLocale ? state.profile.intlLocale : locales;
    const nextOptions = { ...(options ?? {}) };
    if (state.enabled && timeZoneOption && nextOptions.timeZone === undefined) {
      nextOptions.timeZone = state.profile.timezoneId;
      metadata.timeZone = state.profile.timezoneId;
    }
    if (shouldDefaultLocale) {
      metadata.locale = state.profile.intlLocale;
    }
    const instance = Reflect.construct(NativeConstructor, [nextLocales, nextOptions], new.target || NativeConstructor);
    if (metadata.locale || metadata.timeZone) {
      intlInstanceMetadata.set(instance, metadata);
    }
    return instance;
  };

  Object.setPrototypeOf(Wrapped, NativeConstructor);
  Wrapped.prototype = NativeConstructor.prototype;
  maskAsNative(Wrapped, NativeConstructor);

  const nativeSupportedLocalesOf = (NativeConstructor as unknown as { supportedLocalesOf?: (...args: unknown[]) => unknown }).supportedLocalesOf;
  if (nativeSupportedLocalesOf) {
    Object.defineProperty(Wrapped, "supportedLocalesOf", {
      configurable: true,
      value: maskAsNative((...args: unknown[]) => nativeSupportedLocalesOf.apply(NativeConstructor, args), nativeSupportedLocalesOf)
    });
  }

  const nativeResolvedOptions = (NativeConstructor.prototype as { resolvedOptions?: () => Record<string, unknown> }).resolvedOptions;
  if (nativeResolvedOptions) {
    Object.defineProperty(NativeConstructor.prototype, "resolvedOptions", {
      configurable: true,
      value: maskAsNative(function resolvedOptions(this: object) {
        const result = nativeResolvedOptions.call(this);
        const metadata = intlInstanceMetadata.get(this);
        if (state.enabled && metadata?.locale) {
          result.locale = metadata.locale;
        }
        if (state.enabled && timeZoneOption && metadata?.timeZone) {
          result.timeZone = metadata.timeZone;
        }
        return result;
      }, nativeResolvedOptions)
    });
  }

  Object.defineProperty(Intl, name, {
    configurable: true,
    writable: true,
    value: Wrapped
  });
}

function patchDate(): void {
  const nativeGetTime = NativeDate.prototype.getTime;
  const nativeGetTimezoneOffset = NativeDate.prototype.getTimezoneOffset;
  const nativeToString = NativeDate.prototype.toString;
  const nativeToDateString = NativeDate.prototype.toDateString;
  const nativeToTimeString = NativeDate.prototype.toTimeString;
  const nativeToLocaleString = NativeDate.prototype.toLocaleString;
  const nativeToLocaleDateString = NativeDate.prototype.toLocaleDateString;
  const nativeToLocaleTimeString = NativeDate.prototype.toLocaleTimeString;
  const nativeGetYear = (NativeDate.prototype as Date & { getYear?: (this: Date) => number }).getYear;
  const nativeGetters = {
    getFullYear: NativeDate.prototype.getFullYear,
    getMonth: NativeDate.prototype.getMonth,
    getDate: NativeDate.prototype.getDate,
    getDay: NativeDate.prototype.getDay,
    getHours: NativeDate.prototype.getHours,
    getMinutes: NativeDate.prototype.getMinutes,
    getSeconds: NativeDate.prototype.getSeconds,
    getMilliseconds: NativeDate.prototype.getMilliseconds
  };

  function dateFromThis(value: Date): Date {
    return new NativeDate(nativeGetTime.call(value));
  }

  Object.defineProperties(NativeDate.prototype, {
    getTimezoneOffset: {
      configurable: true,
      value: function getTimezoneOffset(this: Date) {
        if (!state.enabled || Number.isNaN(nativeGetTime.call(this))) {
          return nativeGetTimezoneOffset.call(this);
        }
        return getTimezoneOffsetMinutes(dateFromThis(this), state.profile.timezoneId, NativeIntl.DateTimeFormat);
      }
    },
    getYear: {
      configurable: true,
      value: function getYear(this: Date) {
        if (!state.enabled || Number.isNaN(nativeGetTime.call(this))) {
          return typeof nativeGetYear === "function"
            ? nativeGetYear.call(this)
            : nativeGetters.getFullYear.call(this) - 1900;
        }
        return getZonedParts(dateFromThis(this), state.profile.timezoneId, "en-US", NativeIntl.DateTimeFormat).year - 1900;
      }
    },
    getFullYear: { configurable: true, value: zonedGetter("year", nativeGetters.getFullYear) },
    getMonth: { configurable: true, value: zonedGetter("month", nativeGetters.getMonth, -1) },
    getDate: { configurable: true, value: zonedGetter("day", nativeGetters.getDate) },
    getDay: { configurable: true, value: zonedGetter("weekday", nativeGetters.getDay) },
    getHours: { configurable: true, value: zonedGetter("hour", nativeGetters.getHours) },
    getMinutes: { configurable: true, value: zonedGetter("minute", nativeGetters.getMinutes) },
    getSeconds: { configurable: true, value: zonedGetter("second", nativeGetters.getSeconds) },
    getMilliseconds: {
      configurable: true,
      value: function getMilliseconds(this: Date) {
        return nativeGetters.getMilliseconds.call(this);
      }
    },
    toString: {
      configurable: true,
      value: function toString(this: Date) {
        if (!state.enabled || Number.isNaN(nativeGetTime.call(this))) {
          return nativeToString.call(this);
        }
        return formatDateTime(dateFromThis(this));
      }
    },
    toDateString: {
      configurable: true,
      value: function toDateString(this: Date) {
        if (!state.enabled || Number.isNaN(nativeGetTime.call(this))) {
          return nativeToDateString.call(this);
        }
        return formatDateOnly(dateFromThis(this));
      }
    },
    toTimeString: {
      configurable: true,
      value: function toTimeString(this: Date) {
        if (!state.enabled || Number.isNaN(nativeGetTime.call(this))) {
          return nativeToTimeString.call(this);
        }
        return formatTimeOnly(dateFromThis(this));
      }
    },
    toLocaleString: {
      configurable: true,
      value: function toLocaleString(this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        if (!state.enabled) {
          return nativeToLocaleString.call(this, locales, options);
        }
        return nativeToLocaleString.call(this, locales ?? state.profile.intlLocale, withTimeZone(options));
      }
    },
    toLocaleDateString: {
      configurable: true,
      value: function toLocaleDateString(this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        if (!state.enabled) {
          return nativeToLocaleDateString.call(this, locales, options);
        }
        return nativeToLocaleDateString.call(this, locales ?? state.profile.intlLocale, withTimeZone(options));
      }
    },
    toLocaleTimeString: {
      configurable: true,
      value: function toLocaleTimeString(this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        if (!state.enabled) {
          return nativeToLocaleTimeString.call(this, locales, options);
        }
        return nativeToLocaleTimeString.call(this, locales ?? state.profile.intlLocale, withTimeZone(options));
      }
    }
  });

  const nativeDateMethods: Record<string, unknown> = {
    ...nativeGetters,
    getTimezoneOffset: nativeGetTimezoneOffset,
    getYear: nativeGetYear,
    toString: nativeToString,
    toDateString: nativeToDateString,
    toTimeString: nativeToTimeString,
    toLocaleString: nativeToLocaleString,
    toLocaleDateString: nativeToLocaleDateString,
    toLocaleTimeString: nativeToLocaleTimeString
  };
  for (const [name, native] of Object.entries(nativeDateMethods)) {
    maskAsNative((NativeDate.prototype as unknown as Record<string, unknown>)[name], native);
  }

  function GhostDate(this: Date, ...args: unknown[]): string | Date {
    if (!new.target) {
      return new NativeDate().toString();
    }
    return constructDate(args, new.target);
  }
  Object.setPrototypeOf(GhostDate, NativeDate);
  GhostDate.prototype = NativeDate.prototype;
  maskAsNative(GhostDate, NativeDate);
  Object.defineProperties(GhostDate, {
    now: { value: maskAsNative(NativeDate.now.bind(NativeDate), NativeDate.now) },
    parse: { value: maskAsNative(NativeDate.parse.bind(NativeDate), NativeDate.parse) },
    UTC: { value: maskAsNative(NativeDate.UTC.bind(NativeDate), NativeDate.UTC) }
  });
  Object.defineProperty(window, "Date", {
    configurable: true,
    writable: true,
    value: GhostDate
  });

  function zonedGetter(key: keyof ReturnType<typeof getZonedParts>, nativeGetter: (this: Date) => number, adjustment = 0) {
    return function getter(this: Date) {
      if (!state.enabled || Number.isNaN(nativeGetTime.call(this))) {
        return nativeGetter.call(this);
      }
      return getZonedParts(dateFromThis(this), state.profile.timezoneId, "en-US", NativeIntl.DateTimeFormat)[key] + adjustment;
    };
  }
}

function constructDate(args: unknown[], newTarget: Function): Date {
  if (state.enabled && args.length >= 2) {
    const date = dateFromZonedLocalParts(
      state.profile.timezoneId,
      Number(args[0]),
      Number(args[1]),
      args.length >= 3 ? Number(args[2]) : 1,
      args.length >= 4 ? Number(args[3]) : 0,
      args.length >= 5 ? Number(args[4]) : 0,
      args.length >= 6 ? Number(args[5]) : 0,
      args.length >= 7 ? Number(args[6]) : 0,
      NativeIntl.DateTimeFormat
    );
    return constructDateWithNewTarget(NativeDate, [date.getTime()], newTarget);
  }

  return constructDateWithNewTarget(NativeDate, args, newTarget);
}

function withTimeZone(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return {
    ...(options ?? {}),
    timeZone: options?.timeZone ?? state.profile.timezoneId
  };
}

function formatDateTime(date: Date): string {
  return `${formatDateOnly(date)} ${formatTimeOnly(date)}`;
}

function formatDateOnly(date: Date): string {
  const parts = getZonedParts(date, state.profile.timezoneId, "en-US", NativeIntl.DateTimeFormat);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parts.weekday];
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parts.month - 1];
  return `${weekday} ${month} ${pad(parts.day)} ${parts.year}`;
}

function formatTimeOnly(date: Date): string {
  const parts = getZonedParts(date, state.profile.timezoneId, "en-US", NativeIntl.DateTimeFormat);
  const offset = getTimezoneOffsetMinutes(date, state.profile.timezoneId, NativeIntl.DateTimeFormat);
  const name = timeZoneName(date);
  return `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)} ${getOffsetLabel(offset)} (${name})`;
}

function timeZoneName(date: Date): string {
  const formatted = formatSpoofedTimeString(date, "en-US", state.profile.timezoneId, NativeIntl.DateTimeFormat);
  const match = formatted.match(/\(([^)]+)\)$/);
  if (match) {
    return match[1];
  }
  const chunks = formatted.split(" ");
  return chunks.slice(1).join(" ") || state.profile.timezoneId;
}

function patchGeolocation(): void {
  const watches = new Map<number, { nativeId?: number; timer?: number }>();
  let watchId = 1;
  const nativeGeolocationPrototype = window.Geolocation?.prototype;
  const geolocationMethods = {
    getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback, options?: PositionOptions) {
      if (!state.enabled && nativeGeolocation) {
        return nativeGeolocation.getCurrentPosition.call(nativeGeolocation, success, error, options);
      }
      queueMicrotask(() => success(buildPosition()));
      return undefined;
    },
    watchPosition(success: PositionCallback, error?: PositionErrorCallback, options?: PositionOptions) {
      const id = watchId;
      watchId += 1;
      if (!state.enabled && nativeGeolocation) {
        const nativeId = nativeGeolocation.watchPosition.call(nativeGeolocation, success, error, options);
        watches.set(id, { nativeId });
        return id;
      }
      queueMicrotask(() => success(buildPosition()));
      const timer = window.setInterval(() => success(buildPosition()), Math.max(options?.maximumAge ?? 30000, 1000));
      watches.set(id, { timer });
      return id;
    },
    clearWatch(id: number) {
      const watch = watches.get(id);
      if (!watch) {
        return;
      }
      if (watch.nativeId !== undefined && nativeGeolocation) {
        nativeGeolocation.clearWatch.call(nativeGeolocation, watch.nativeId);
      }
      if (watch.timer !== undefined) {
        window.clearInterval(watch.timer);
      }
      watches.delete(id);
    }
  };
  // Present a real Geolocation-shaped object: native prototype for the
  // toString tag, own methods that print as native code.
  const geolocation = Object.create(nativeGeolocationPrototype ?? Object.prototype) as Geolocation;
  for (const name of ["getCurrentPosition", "watchPosition", "clearWatch"] as const) {
    Object.defineProperty(geolocation, name, {
      configurable: true,
      writable: true,
      value: maskAsNative(geolocationMethods[name], nativeGeolocationPrototype?.[name])
    });
  }

  defineNavigatorGetter("geolocation", () => geolocation);
}

function patchFontFaceSet(): void {
  const fontSet = document.fonts;
  const prototype = fontSet ? Object.getPrototypeOf(fontSet) as FontFaceSet : window.FontFaceSet?.prototype;
  if (!prototype || typeof prototype.check !== "function" || typeof prototype.load !== "function") {
    return;
  }
  const nativeCheck = prototype.check;
  const nativeLoad = prototype.load;
  const patchedCheck = function check(this: FontFaceSet, font: string, text?: string) {
    if (state.enabled && canvasFontHasBlockedFamily(font, state.profile, currentDocumentFontFamilies())) {
      return false;
    }
    return nativeCheck.call(this, font, text);
  };
  const patchedLoad = function load(this: FontFaceSet, font: string, text?: string) {
    if (state.enabled && canvasFontHasBlockedFamily(font, state.profile, currentDocumentFontFamilies())) {
      return Promise.resolve([]);
    }
    return nativeLoad.call(this, font, text);
  };

  maskAsNative(patchedCheck, nativeCheck);
  maskAsNative(patchedLoad, nativeLoad);
  defineMethod(prototype, "check", patchedCheck);
  defineMethod(prototype, "load", patchedLoad);
  if (fontSet) {
    defineMethod(fontSet, "check", patchedCheck);
    defineMethod(fontSet, "load", patchedLoad);
  }
}

function buildPosition(): GeolocationPosition {
  const jitterLat = stableNumber(`${state.seed}:geo:lat`, -0.00015, 0.00015);
  const jitterLon = stableNumber(`${state.seed}:geo:lon`, -0.00015, 0.00015);
  return {
    coords: {
      latitude: Math.max(-90, Math.min(90, state.profile.latitude + jitterLat)),
      longitude: Math.max(-180, Math.min(180, state.profile.longitude + jitterLon)),
      accuracy: state.profile.accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return this;
      }
    },
    timestamp: NativeDate.now(),
    toJSON() {
      return this;
    }
  };
}

function patchCanvas(): void {
  const contextPrototype = window.CanvasRenderingContext2D?.prototype;
  if (contextPrototype) {
    const nativeMeasureText = contextPrototype.measureText;
    Object.defineProperty(contextPrototype, "measureText", {
      configurable: true,
      value: function measureText(this: CanvasRenderingContext2D, text: string) {
        if (!state.canvasMeasureTextSpoofingEnabled) {
          return nativeMeasureText.call(this, text);
        }
        const font = this.font;
        const sanitizedFont = sanitizeCanvasFont(font, state.profile, currentDocumentFontFamilies());
        const metrics = sanitizedFont === font ? nativeMeasureText.call(this, text) : measureTextWithFont(this, nativeMeasureText, text, sanitizedFont);
        return new Proxy(metrics, {
          get(target, property) {
            const value = Reflect.get(target, property, target);
            if (typeof value === "number") {
              const delta = stableNumber(`${state.seed}:measure:${String(text)}:${String(property)}:${quantizeMetric(value)}`, -0.0035, 0.0035);
              return value * (1 + delta);
            }
            if (typeof value === "function") {
              return value.bind(target);
            }
            return value;
          }
        });
      }
    });
    maskAsNative(contextPrototype.measureText, nativeMeasureText);
  }
}

function currentDocumentFontFamilies(): string[] {
  try {
    return [...document.fonts].map((font) => font.family);
  } catch {
    return [];
  }
}

function measureTextWithFont(
  context: CanvasRenderingContext2D,
  nativeMeasureText: CanvasRenderingContext2D["measureText"],
  text: string,
  font: string
): TextMetrics {
  const originalFont = context.font;
  try {
    context.font = font;
    return nativeMeasureText.call(context, text);
  } finally {
    context.font = originalFont;
  }
}

function patchWebGL(): void {
  patchWebGLPrototype(window.WebGLRenderingContext?.prototype);
  patchWebGLPrototype(window.WebGL2RenderingContext?.prototype);
}

function patchWebGLPrototype(prototype: WebGLRenderingContext | WebGL2RenderingContext | undefined): void {
  if (!prototype) {
    return;
  }
  const nativeGetParameter = prototype.getParameter;
  Object.defineProperty(prototype, "getParameter", {
    configurable: true,
    writable: true,
    value: maskAsNative(new Proxy(nativeGetParameter, {
      apply(target, thisArgument, argumentsList) {
        let parameter = argumentsList[0];
        if (parameter !== null && (typeof parameter === "object" || typeof parameter === "function")) {
          const originalParameter = parameter;
          // Let the native binding drive coercion, retaining its receiver/error
          // checks and the original conversion methods' `this`. Record their
          // result rather than coercing the caller's object a second time.
          argumentsList[0] = new Proxy({}, {
            get(_target, key) {
              const value = Reflect.get(originalParameter, key);
              return typeof value === "function"
                ? (...args: unknown[]) => (parameter = Reflect.apply(value, originalParameter, args))
                : value;
            }
          });
        }
        // Preserve the native query, receiver checks and null/error results.
        // Only replace valid unmasked identity strings; all other parameters,
        // extension availability and pixel output remain native.
        const nativeValue = Reflect.apply(target, thisArgument, argumentsList);
        if (state.webglInfoSpoofingEnabled && typeof nativeValue === "string") {
          parameter = +parameter >>> 0; // GLenum is an unsigned Web IDL long.
          if (parameter === 0x9245) {
            return state.profile.webglVendor;
          }
          if (parameter === 0x9246) {
            return state.profile.webglRenderer;
          }
        }
        return nativeValue;
      }
    }), nativeGetParameter)
  });
}

// WebGPU reports the GPU family through GPUAdapterInfo (reachable via
// adapter.info, device.adapterInfo and the legacy requestAdapterInfo()). Keep
// it in agreement with the profile's WebGL renderer; limits and features stay
// native because they cannot be faked consistently.
function patchWebGPU(): void {
  const adapterInfoPrototype = (window as unknown as { GPUAdapterInfo?: { prototype: object } }).GPUAdapterInfo?.prototype;
  if (!adapterInfoPrototype) {
    return;
  }
  for (const property of ["vendor", "architecture", "device", "description"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(adapterInfoPrototype, property);
    const nativeGetter = descriptor?.get;
    if (!nativeGetter) {
      continue;
    }
    try {
      Object.defineProperty(adapterInfoPrototype, property, {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get: nativeMappingGetter(nativeGetter, (nativeValue) => {
          const spoofed = state.webglInfoSpoofingEnabled ? webgpuAdapterInfoForProfile(state.profile) : null;
          return spoofed ? spoofed[property] : nativeValue;
        })
      });
    } catch {
      // Some builds freeze WebGPU prototypes; the WebGL surface is still covered.
    }
  }
}

function nativeMappingGetter(nativeGetter: () => unknown, map: (nativeValue: unknown) => unknown): () => unknown {
  return maskAsNative(new Proxy(nativeGetter, {
    apply(target, thisArgument, argumentsList) {
      return map(Reflect.apply(target, thisArgument, argumentsList));
    }
  }), nativeGetter);
}

// Dedicated workers get their own WebGL and WebGPU globals that the page
// patches cannot reach. Blob workers (the shape fingerprinting libraries use
// for inline probes) are re-created from a wrapper blob that installs the same
// identity before loading the original script. Same-origin URL workers are
// left alone: rewriting them to blob: would break relative importScripts,
// self.location, and any CSP that forbids blob workers.
function patchWorkers(): void {
  const NativeWorker = window.Worker;
  const NativeBlob = window.Blob;
  const nativeCreateObjectURL = URL.createObjectURL;
  const nativeRevokeObjectURL = URL.revokeObjectURL;
  if (typeof NativeWorker !== "function" || typeof NativeBlob !== "function"
    || typeof nativeCreateObjectURL !== "function" || typeof nativeRevokeObjectURL !== "function") {
    return;
  }
  const createObjectURL = (blob: Blob): string => Reflect.apply(nativeCreateObjectURL, URL, [blob]) as string;
  const revokeObjectURL = (url: string): void => {
    Reflect.apply(nativeRevokeObjectURL, URL, [url]);
  };

  // Remember which Blob backs each object URL the page creates. Opaque
  // origins (file://, sandboxed frames) cannot re-fetch their own blob: URLs
  // from inside another worker, so those workers are rebuilt from the Blob
  // itself instead of being loaded through importScripts.
  const blobRegistry = new Map<string, Blob>();
  try {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: maskAsNative(new Proxy(nativeCreateObjectURL, {
        apply(target, thisArgument, argumentsList) {
          const url = Reflect.apply(target, thisArgument, argumentsList) as string;
          const source = argumentsList[0];
          if (source instanceof NativeBlob && blobRegistry.size < 512) {
            blobRegistry.set(url, source);
          }
          return url;
        }
      }), nativeCreateObjectURL)
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: maskAsNative(new Proxy(nativeRevokeObjectURL, {
        apply(target, thisArgument, argumentsList) {
          blobRegistry.delete(String(argumentsList[0]));
          return Reflect.apply(target, thisArgument, argumentsList);
        }
      }), nativeRevokeObjectURL)
    });
  } catch {
    // Without the registry, opaque-origin blob workers simply stay native.
  }

  const wrapBlobWorker = (scriptURL: string, options?: WorkerOptions): string | null => {
    if (!state.enabled || !state.webglInfoSpoofingEnabled || !/^blob:/i.test(scriptURL)) {
      return null;
    }
    try {
      const prelude = workerIdentityPrelude(state.profile);
      const original = blobRegistry.get(scriptURL);
      // file:// documents still report location.origin as "file://", but the
      // blob URLs they mint are "blob:null/…" and cannot be re-fetched from a
      // worker, so the URL itself is the reliable opaque-origin signal.
      if (/^blob:null\//i.test(scriptURL)) {
        if (!original) {
          return null;
        }
        return createObjectURL(new NativeBlob([`${prelude}\n`, original], { type: original.type || "text/javascript" }));
      }
      // Load the original as its own script so its directive prologue and
      // error reporting stay intact. A static import would evaluate a module
      // before this prelude, so module workers import dynamically and
      // re-throw failures asynchronously to keep the worker's error event.
      const loader = options?.type === "module"
        ? `import(${JSON.stringify(scriptURL)}).catch(function(error){setTimeout(function(){throw error;});});`
        : `importScripts(${JSON.stringify(scriptURL)});`;
      return createObjectURL(new NativeBlob([`${prelude}\n${loader}`], { type: "text/javascript" }));
    } catch {
      return null;
    }
  };

  const WrappedWorker = maskAsNative(new Proxy(NativeWorker, {
    construct(target, argumentsList, newTarget) {
      const [scriptURL, options] = argumentsList as [string | URL, WorkerOptions | undefined];
      const wrappedURL = wrapBlobWorker(String(scriptURL), options);
      if (wrappedURL) {
        try {
          return Reflect.construct(target, [wrappedURL, options], newTarget);
        } catch {
          // Fall back to the untouched script below.
        } finally {
          // The worker fetches its script at construction; keep the wrapper
          // reachable briefly for slow starts, then release it.
          setTimeout(() => revokeObjectURL(wrappedURL), 60_000);
        }
      }
      return Reflect.construct(target, argumentsList, newTarget);
    }
  }), NativeWorker);

  try {
    Object.defineProperty(window, "Worker", {
      configurable: true,
      writable: true,
      value: WrappedWorker
    });
  } catch {
    // Leave the native constructor in place when the property is locked.
  }
}

function workerIdentityPrelude(profile: Profile): string {
  const webgpu = webgpuAdapterInfoForProfile(profile);
  return [
    "(function(){",
    "var sources=new WeakMap(),nativeToString=Function.prototype.toString;",
    "function mask(wrapper,native){sources.set(wrapper,native);return wrapper;}",
    "try{Object.defineProperty(Function.prototype,\"toString\",{configurable:true,writable:true,value:mask(function toString(){var native=sources.get(this);return nativeToString.call(native||this);},nativeToString)});}catch(error){}",
    `var vendor=${JSON.stringify(profile.webglVendor)},renderer=${JSON.stringify(profile.webglRenderer)};`,
    "function patchWebGL(proto){if(!proto)return;var nativeGetParameter=proto.getParameter;try{",
    "Object.defineProperty(proto,\"getParameter\",{configurable:true,writable:true,value:mask(new Proxy(nativeGetParameter,{apply:function(target,receiver,args){",
    "var parameter=args[0];if(parameter!==null&&(typeof parameter===\"object\"||typeof parameter===\"function\")){var originalParameter=parameter;args[0]=new Proxy({},{get:function(_,key){var method=Reflect.get(originalParameter,key);return typeof method===\"function\"?function(){return parameter=Reflect.apply(method,originalParameter,arguments);}:method;}});}",
    "var value=Reflect.apply(target,receiver,args);if(typeof value===\"string\"){parameter=+parameter>>>0;if(parameter===37445)return vendor;if(parameter===37446)return renderer;}return value;}}),nativeGetParameter)});",
    "}catch(error){}}",
    "patchWebGL(self.WebGLRenderingContext&&self.WebGLRenderingContext.prototype);",
    "patchWebGL(self.WebGL2RenderingContext&&self.WebGL2RenderingContext.prototype);",
    webgpu
      ? `var info=${JSON.stringify(webgpu)},gpuProto=self.GPUAdapterInfo&&self.GPUAdapterInfo.prototype;if(gpuProto){["vendor","architecture","device","description"].forEach(function(key){var descriptor=Object.getOwnPropertyDescriptor(gpuProto,key);if(!descriptor||!descriptor.get)return;var nativeGetter=descriptor.get;try{Object.defineProperty(gpuProto,key,{configurable:true,enumerable:descriptor.enumerable,get:mask(function(){nativeGetter.call(this);return info[key];},nativeGetter)});}catch(error){}});}`
      : "",
    "})();"
  ].join("");
}

function findDescriptorOwner(prototype: object | null, property: string): object | null {
  let current: object | null = prototype;
  while (current) {
    const descriptor = Object.getOwnPropertyDescriptor(current, property);
    if (descriptor) {
      return current;
    }
    current = Object.getPrototypeOf(current);
  }
  return null;
}

function defineMethod(target: object, property: string, value: unknown): void {
  try {
    Object.defineProperty(target, property, {
      configurable: true,
      writable: true,
      value
    });
  } catch {
    // Some browser-owned prototypes reject redefinition; other surfaces remain patched.
  }
}

function pad(value: number): string {
  return Math.trunc(value).toString().padStart(2, "0");
}

function quantizeMetric(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return value.toFixed(4);
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function createNonce(): string {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(8, "0")).join("");
}
}
