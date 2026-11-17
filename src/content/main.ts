import { voicesForProfile, type ProfileVoice } from "../shared/voices";
import { keyboardLayoutForProfile } from "../shared/keyboard";
import { stableNumber, stableSeed } from "../shared/hash";
import { canvasFontHasBlockedFamily, sanitizeCanvasFont } from "../shared/fonts";
import { strictModeForBlobParts } from "../shared/worker-blob";
import { workerIdentityPrelude as buildWorkerIdentityPrelude } from "../shared/worker-prelude";
import { isSupportedPageUrl } from "../shared/internal";
import { appVersionForProfile, fallbackProfileForSite, navigatorPlatformForProfile, navigatorVendorForProfile, userAgentForProfile, userAgentMetadataForProfile, webgpuAdapterInfoForProfile } from "../shared/profiles";
import { DEFAULT_EXCLUDED_DOMAINS, DEFAULT_SITE_RULE, isExcludedUrl, siteKeyFromUrl } from "../shared/site";
import { installTimePatches } from "../shared/time-patch";
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

interface BootstrapPayload {
  build?: BuildTarget;
  settings?: GhostSettings;
}

interface GhostController {
  readonly installed: true;
}

// What a same-origin parent Ghost realm reports, read through its public
// surfaces so the parent never has to expose its settings or canvas seed.
interface ParentIdentity {
  profile: Pick<Profile, "locale" | "languages" | "deviceMemory" | "timezoneId" | "intlLocale">;
  globalPrivacyControl: boolean;
  localVoices: () => ProfileVoice[] | null;
  userAgent: {
    platform: unknown;
    vendor: unknown;
    userAgent: unknown;
    appVersion: unknown;
    userAgentData: object | undefined;
  } | null;
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
// A related about:blank/srcdoc frame or popup has no bootstrap settings. When
// the page that created it runs Ghost, report what that page reports instead
// of the fallback profile.
const parentIdentity = __GHOST_RELATED_ONLY__ ? readParentIdentity() : null;
const initialPageUrl = currentGhostPageUrl();
const initialTopLevelUrl = currentTopLevelGhostPageUrl(initialPageUrl);
const fallbackSiteKey = siteKeyFromUrl(initialTopLevelUrl);
const bootstrapProfile = pendingBootstrap
  ? resolveBootstrapPayload(pendingBootstrap, initialPageUrl, initialTopLevelUrl)
  : null;
const baseProfile = bootstrapProfile?.profile ?? fallbackProfileForSite(DEFAULT_SITE_RULE);
const fallbackProfile: Profile = parentIdentity ? { ...baseProfile, ...parentIdentity.profile } : baseProfile;
const initialEnabled = bootstrapProfile?.enabled ?? (initialPageUrl ? !isExcludedUrl(initialPageUrl, DEFAULT_EXCLUDED_DOMAINS) : false);
const initialGlobalPrivacyControlEnabled = bootstrapProfile?.globalPrivacyControlEnabled
  ?? parentIdentity?.globalPrivacyControl
  ?? DEFAULT_SETTINGS.globalPrivacyControlEnabled;
const initialUserAgentSpoofingEnabled = bootstrapProfile?.uaSpoofingEnabled
  ?? (parentIdentity ? parentIdentity.userAgent !== null : initialEnabled);
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
const patchedSpeechRealms = new WeakSet<object>();
const patchedKeyboardRealms = new WeakSet<object>();

Object.defineProperty(ghostGlobal, "__GHOST_PAGE_CONTROLLER__", {
  configurable: false,
  enumerable: false,
  writable: false,
  value: Object.freeze({ installed: true as const })
});

if (initialPageUrl) {
  install();
  // A frame mirroring its parent stays with the parent's identity; a later
  // resolved profile could only disagree with it or reload the frame.
  if (!parentIdentity) {
    connectBridge();
  }
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
  patchSpeechSynthesis(window);
  patchKeyboard(window);
  patchIframeNavigatorAccess();
  installTimePatches({
    enabled: () => state.enabled,
    intlLocale: () => state.profile.intlLocale,
    timezoneId: () => state.profile.timezoneId,
    maskAsNative
  });
  patchGeolocation();
  patchFontFaceSet();
  patchCanvas();
  if (installedSurfaceOwnership.webglInfo) {
    patchWebGL();
    patchWebGPU();
  }
  patchWorkers();
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

function readParentIdentity(): ParentIdentity | null {
  for (const candidate of [window.parent, window.opener as Window | null]) {
    try {
      if (!candidate || candidate === window || !(candidate as unknown as typeof ghostGlobal).__GHOST_PAGE_CONTROLLER__) {
        continue;
      }
      const parentGlobal = candidate as Window & typeof globalThis;
      const nav = parentGlobal.navigator as unknown as Record<string, unknown>;
      const options = new parentGlobal.Intl.DateTimeFormat().resolvedOptions();
      const userAgentData = "userAgentData" in nav ? nav.userAgentData as object | undefined : undefined;
      const userAgent = {
        platform: nav.platform,
        vendor: nav.vendor,
        userAgent: nav.userAgent,
        appVersion: nav.appVersion,
        userAgentData
      };
      // Same browser, so a parent reporting this frame's native values does
      // not own them and the frame can leave them native.
      const userAgentOwned = (["platform", "vendor", "userAgent", "appVersion"] as const)
        .some((property) => userAgent[property] !== nativeNavigator[property])
        || JSON.stringify(userAgentData ?? null) !== JSON.stringify(nativeNavigator.userAgentData ?? null);
      return {
        profile: {
          locale: String(nav.language),
          languages: Array.from(nav.languages as ArrayLike<string>, String),
          deviceMemory: nav.deviceMemory as number,
          timezoneId: options.timeZone,
          intlLocale: options.locale
        },
        globalPrivacyControl: Boolean(nav.globalPrivacyControl),
        // UA values alone cannot reveal ownership on a host whose native UA
        // already matches the profile. Read this surface publicly as well.
        localVoices: () => {
          try {
            return parentGlobal.speechSynthesis
              ? Array.from(parentGlobal.speechSynthesis.getVoices())
                .filter((voice) => voice.localService)
                .map(({ name, lang, voiceURI, localService, default: isDefault }) => ({ name, lang, voiceURI, localService, default: isDefault }))
              : null;
          } catch {
            // An opener can navigate cross-origin after this frame installs.
            return null;
          }
        },
        userAgent: userAgentOwned ? userAgent : null
      };
    } catch {
      // Cross-origin or detached parents cannot be read.
    }
  }
  return null;
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

function patchFunctionToString(realm: Window & typeof globalThis = window): void {
  const nativeToString = realm.Function.prototype.toString;
  const maskedToString = function toString(this: unknown): string {
    const source = (typeof this === "function" || (typeof this === "object" && this !== null))
      ? nativeFunctionSources.get(this as object)
      : undefined;
    return Reflect.apply(nativeToString, source ?? this, []) as string;
  };
  nativeFunctionSources.set(maskedToString, nativeToString);
  try {
    Object.defineProperty(realm.Function.prototype, "toString", {
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
  const parentUserAgent = parentIdentity?.userAgent;
  if (parentUserAgent) {
    defineNavigatorGetter("platform", () => parentUserAgent.platform);
    defineNavigatorGetter("vendor", () => parentUserAgent.vendor);
    defineNavigatorGetter("userAgent", () => parentUserAgent.userAgent);
    defineNavigatorGetter("appVersion", () => parentUserAgent.appVersion);
    const parentData = parentUserAgent.userAgentData;
    if (parentData) {
      const mirrored = mirroredUserAgentData(parentData);
      defineNavigatorGetter("userAgentData", () => mirrored);
    } else {
      hideNavigatorProperty("userAgentData");
    }
  } else if (installedSurfaceOwnership.userAgent) {
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
    // User-Agent surfaces are checked even when Ghost does not own them: a
    // child install that could not read this page falls back to the default
    // profile. Values the child already reports are left to the child, which
    // keeps objects such as userAgentData in the child's own realm.
    const properties = [
      "language",
      "languages",
      "deviceMemory",
      "globalPrivacyControl",
      "platform",
      "vendor",
      "userAgent",
      "appVersion",
      "userAgentData"
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
      if (sameJson((childNavigator as unknown as Record<string, unknown>)[property], mainNavigator[property])) {
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
    // Direct iframe access can precede all-frame injection. Install these in
    // the child's realm as well, using this document's live profile. Do not
    // extend protection into excluded child documents.
    const childUrl = currentChildPageUrl(childGlobal);
    const relatedChild = childGlobal.location.href === "about:blank" || childGlobal.location.href === "about:srcdoc";
    // A related-only install has no exclusion settings. Its navigated children
    // must use their own bootstrap rather than risk patching a custom exclusion.
    const canCheckExclusions = pendingBootstrap?.settings !== undefined || relatedChild;
    if (canCheckExclusions && childUrl && !isExcludedUrl(childUrl, pendingBootstrap?.settings?.excludedDomains ?? DEFAULT_EXCLUDED_DOMAINS)) {
      patchFunctionToString(childGlobal);
      patchSpeechSynthesis(childGlobal);
      patchKeyboard(childGlobal);
    }
    synchronizedChildNavigators.add(childNavigator);
  } catch {
    // Cross-origin frame globals are intentionally inaccessible to the parent.
  }
}

function currentChildPageUrl(child: Window & typeof globalThis): string {
  const url = child.location.href;
  return url === "about:blank" || url === "about:srcdoc" ? initialPageUrl : isSupportedPageUrl(url) ? url : "";
}

function patchSpeechSynthesis(realm: Window & typeof globalThis): void {
  const synth = realm.speechSynthesis;
  const voicePrototype = realm.SpeechSynthesisVoice?.prototype;
  const utterancePrototype = realm.SpeechSynthesisUtterance?.prototype;
  if (!synth || !voicePrototype || !utterancePrototype || patchedSpeechRealms.has(realm)) return;
  patchedSpeechRealms.add(realm);
  const synthPrototype = realm.Object.getPrototypeOf(synth) as SpeechSynthesis;
  const nativeGetVoices = synthPrototype.getVoices;
  if (typeof nativeGetVoices !== "function") return;
  const fakeVoices = new WeakMap<object, ProfileVoice>();
  const assignedVoices = new WeakMap<object, SpeechSynthesisVoice>();
  let cache: { key: string; voices: SpeechSynthesisVoice[] } | null = null;
  const active = (): boolean => state.enabled && (parentIdentity !== null || (state.uaSpoofingEnabled
    && state.profile.uaMode !== "native" && realm.navigator.platform !== "MacIntel"));
  for (const property of ["name", "lang", "voiceURI", "localService", "default"] as const) {
    const descriptor = realm.Object.getOwnPropertyDescriptor(voicePrototype, property);
    const nativeGetter = descriptor?.get;
    if (!descriptor || !nativeGetter) continue;
    realm.Object.defineProperty(voicePrototype, property, {
      ...descriptor,
      get: maskAsNative(new Proxy(nativeGetter, {
        apply(target, receiver, args) {
          const voice = fakeVoices.get(receiver);
          return voice ? voice[property] : Reflect.apply(target, receiver, args);
        }
      }), nativeGetter)
    });
  }
  defineMethod(synthPrototype, "getVoices", maskAsNative(new Proxy(nativeGetVoices, {
    apply(target, receiver, args) {
      const nativeVoices = Reflect.apply(target, receiver, args) as SpeechSynthesisVoice[];
      if (!active()) return nativeVoices;
      const descriptions = parentIdentity
        ? parentIdentity.localVoices()
        : voicesForProfile(state.profile, realm.navigator.platform);
      if (!descriptions) return nativeVoices;
      if (parentIdentity && sameJson(descriptions, nativeVoices.filter((voice) => voice.localService)
        .map(({ name, lang, voiceURI, localService, default: isDefault }) => ({ name, lang, voiceURI, localService, default: isDefault })))) {
        return nativeVoices;
      }
      const key = JSON.stringify(descriptions);
      if (cache?.key !== key) {
        const voices = descriptions.map((description) => {
          const voice = realm.Object.create(voicePrototype) as SpeechSynthesisVoice;
          fakeVoices.set(voice, description);
          return voice;
        });
        cache = { key, voices };
      }
      // Local profile voices are available immediately, even on the first
      // call. Keep native voiceschanged events untouched: they still announce
      // the browser's asynchronous remote-voice loading; no synthetic events.
      return realm.Array.from([...cache.voices, ...nativeVoices.filter((voice) => !voice.localService)]);
    }
  }), nativeGetVoices));
  const descriptor = realm.Object.getOwnPropertyDescriptor(utterancePrototype, "voice");
  const nativeGetter = descriptor?.get;
  const nativeSetter = descriptor?.set;
  if (!descriptor || !nativeGetter || !nativeSetter) return;
  realm.Object.defineProperty(utterancePrototype, "voice", {
    ...descriptor,
    get: maskAsNative(new Proxy(nativeGetter, {
      apply(target, receiver, args) {
        const nativeVoice = Reflect.apply(target, receiver, args);
        return active() ? assignedVoices.get(receiver) ?? nativeVoice : nativeVoice;
      }
    }), nativeGetter),
    set: maskAsNative(new Proxy(nativeSetter, {
      apply(target, receiver, args) {
        const voice = args[0] as SpeechSynthesisVoice | null;
        const description = voice && fakeVoices.get(voice);
        if (description) {
          const nativeVoices = Reflect.apply(nativeGetVoices, synth, []) as SpeechSynthesisVoice[];
          const match = nativeVoices.find((candidate) => candidate.lang.toLowerCase() === description.lang.toLowerCase());
          const result = Reflect.apply(target, receiver, [match ?? null]);
          assignedVoices.set(receiver, voice);
          return result;
        }
        const result = Reflect.apply(target, receiver, args);
        assignedVoices.delete(receiver);
        return result;
      }
    }), nativeSetter)
  });
}

function patchKeyboard(realm: Window & typeof globalThis): void {
  // The Keyboard API is absent in insecure contexts and in older Chromium.
  const keyboardGlobal = realm as typeof realm & {
    KeyboardLayoutMap?: { prototype: object };
    navigator: Navigator & { keyboard?: object };
  };
  const keyboard = keyboardGlobal.navigator.keyboard;
  const prototype = keyboardGlobal.KeyboardLayoutMap?.prototype;
  if (!keyboard || !prototype || patchedKeyboardRealms.has(realm)) return;
  patchedKeyboardRealms.add(realm);
  const keyboardPrototype = realm.Object.getPrototypeOf(keyboard) as { getLayoutMap?: Function };
  const nativeGetLayoutMap = keyboardPrototype.getLayoutMap;
  const nativeKeys = realm.Object.getOwnPropertyDescriptor(prototype, "keys")?.value as Function | undefined;
  if (!nativeGetLayoutMap || !nativeKeys) return;
  const fakeMaps = new WeakMap<object, Map<string, string>>();
  const backingMaps = new WeakMap<object, object>();
  const fakeIterators = new WeakMap<object, Iterator<unknown>>();
  const patchedIteratorPrototypes = new WeakSet<object>();
  const iteratorFor = (nativeMethod: Function, receiver: object, map: Map<string, string>, property: PropertyKey): object => {
    const iterator = Reflect.apply(nativeMethod, backingMaps.get(receiver), []) as object;
    const iteratorPrototype = realm.Object.getPrototypeOf(iterator) as { next: Function };
    if (!patchedIteratorPrototypes.has(iteratorPrototype)) {
      const nativeNext = iteratorPrototype.next;
      defineMethod(iteratorPrototype, "next", maskAsNative(new Proxy(nativeNext, {
        apply(target, iteratorReceiver, args) {
          const fake = fakeIterators.get(iteratorReceiver);
          return fake ? fake.next() : Reflect.apply(target, iteratorReceiver, args);
        }
      }), nativeNext));
      patchedIteratorPrototypes.add(iteratorPrototype);
    }
    const fake = Reflect.apply(map[property as "entries" | "keys" | "values" | typeof Symbol.iterator], map, []) as Iterator<unknown>;
    fakeIterators.set(iterator, fake);
    return iterator;
  };
  const methodWrappers = new Map<Function, Function>();
  for (const property of ["get", "has", "entries", "keys", "values", "forEach", Symbol.iterator]) {
    const nativeMethod = realm.Object.getOwnPropertyDescriptor(prototype, property)?.value as Function | undefined;
    if (!nativeMethod) continue;
    const wrapper = methodWrappers.get(nativeMethod) ?? maskAsNative(new Proxy(nativeMethod, {
      apply(target, receiver, args) {
        const map = fakeMaps.get(receiver);
        if (!map) return Reflect.apply(target, receiver, args);
        if (property === "get" || property === "has") {
          // WebIDL maplike keys are required DOMStrings, not arbitrary Map keys.
          if (!args.length || typeof args[0] === "symbol") throw new realm.TypeError("Invalid KeyboardLayoutMap key");
          return map[property](String(args[0]));
        }
        if (property === "forEach") {
          const callback = args[0] as Function;
          if (typeof callback !== "function") throw new realm.TypeError("Callback must be a function");
          return map.forEach((value, key) => Reflect.apply(callback, args[1], [value, key, receiver]));
        }
        return iteratorFor(target, receiver, map, property);
      }
    }), nativeMethod);
    methodWrappers.set(nativeMethod, wrapper);
    defineMethod(prototype, property, wrapper);
  }
  const sizeDescriptor = realm.Object.getOwnPropertyDescriptor(prototype, "size");
  const nativeSize = sizeDescriptor?.get;
  if (sizeDescriptor && nativeSize) {
    realm.Object.defineProperty(prototype, "size", {
      ...sizeDescriptor,
      get: maskAsNative(new Proxy(nativeSize, {
        apply(target, receiver, args) {
          const map = fakeMaps.get(receiver);
          return map ? map.size : Reflect.apply(target, receiver, args);
        }
      }), nativeSize)
    });
  }
  defineMethod(keyboardPrototype, "getLayoutMap", maskAsNative(new Proxy(nativeGetLayoutMap, {
    apply(target, receiver, args) {
      // Always let Chromium enforce permissions policy and frame restrictions.
      const promise = Reflect.apply(target, receiver, args) as Promise<object>;
      return promise.then((nativeMap) => {
        if (!state.enabled) return nativeMap;
        const layout = new realm.Map(keyboardLayoutForProfile(state.profile));
        const ordered = new realm.Map<string, string>();
        // Blink iterates a HashMap, not the browser process's sorted map. Keep
        // its observable order for shared codes; append profile-only codes in
        // deterministic code order rather than guessing Blink's hash ordering.
        const codes = Reflect.apply(nativeKeys, nativeMap, []) as Iterable<string>;
        for (const code of codes) {
          if (layout.has(code)) ordered.set(code, layout.get(code)!);
        }
        for (const [code, key] of layout) {
          if (!ordered.has(code)) ordered.set(code, key);
        }
        const fakeMap = realm.Object.create(prototype) as object;
        fakeMaps.set(fakeMap, ordered);
        backingMaps.set(fakeMap, nativeMap);
        return fakeMap;
      });
    }
  }), nativeGetLayoutMap));
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

// A copy of the parent's userAgentData built in this realm, so that it is an
// instance of this frame's NavigatorUAData like the native one would be.
function mirroredUserAgentData(parentData: object): object {
  const source = parentData as { toJSON(): unknown; getHighEntropyValues(hints: string[]): Promise<unknown> };
  const low = cloneJson(source.toJSON()) as { brands: Array<Record<string, unknown>>; mobile: boolean; platform: string };
  const nativeUaDataPrototype = (window as unknown as { NavigatorUAData?: { prototype: Record<string, unknown> } }).NavigatorUAData?.prototype;
  const value = Object.create(nativeUaDataPrototype ?? Object.prototype) as Record<string, unknown>;
  Object.defineProperties(value, {
    brands: { value: Object.freeze(low.brands.map((brand) => Object.freeze({ ...brand }))), enumerable: true },
    mobile: { value: low.mobile, enumerable: true },
    platform: { value: low.platform, enumerable: true },
    getHighEntropyValues: {
      value: maskAsNative(async function getHighEntropyValues(hints: string[]) {
        return cloneJson(await source.getHighEntropyValues(hints));
      }, nativeUaDataPrototype?.getHighEntropyValues)
    },
    toJSON: {
      value: maskAsNative(function toJSON() {
        return cloneJson(low);
      }, nativeUaDataPrototype?.toJSON)
    }
  });
  return Object.freeze(value);
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
        if (!state.enabled) {
          return nativeMeasureText.call(this, text);
        }
        const font = this.font;
        const sanitizedFont = sanitizeCanvasFont(font, state.profile, currentDocumentFontFamilies());
        const metrics = sanitizedFont === font ? nativeMeasureText.call(this, text) : measureTextWithFont(this, nativeMeasureText, text, sanitizedFont);
        if (!state.canvasMeasureTextSpoofingEnabled) {
          // Helium owns measureText noise in this mode; Ghost must not add its own Proxy noise.
          return metrics;
        }
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

// Dedicated workers get their own navigator, WebGL and WebGPU globals that the
// page patches cannot reach. Blob workers (the shape fingerprinting libraries use
// for inline probes) are re-created from a wrapper blob that installs the same
// identity and the original bytes in one entry script. Same-origin URL workers are
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

  // Preserve classic scripts' directive mode when prefixing the identity
  // setup. Blob bytes cannot be read synchronously here, so capture only what
  // is safely known from string parts at construction, after native validation.
  const blobModes = new WeakMap<Blob, boolean>();
  const WrappedBlob = maskAsNative(new Proxy(NativeBlob, {
    construct(target, argumentsList, newTarget) {
      const blob = Reflect.construct(target, argumentsList, newTarget) as Blob;
      const strict = strictModeForBlobParts(argumentsList[0]);
      if (strict !== null) {
        blobModes.set(blob, strict);
      }
      return blob;
    }
  }), NativeBlob);
  const blobConstructorDescriptor = Object.getOwnPropertyDescriptor(NativeBlob.prototype, "constructor");
  const globalBlobDescriptor = Object.getOwnPropertyDescriptor(window, "Blob");
  try {
    if (blobConstructorDescriptor && globalBlobDescriptor) {
      Object.defineProperty(NativeBlob.prototype, "constructor", { ...blobConstructorDescriptor, value: WrappedBlob });
      Object.defineProperty(window, "Blob", { ...globalBlobDescriptor, value: WrappedBlob });
    }
  } catch {
    // Restore both descriptors if this realm does not permit observation.
    if (blobConstructorDescriptor) {
      try { Object.defineProperty(NativeBlob.prototype, "constructor", blobConstructorDescriptor); } catch {}
    }
    if (globalBlobDescriptor) {
      try { Object.defineProperty(window, "Blob", globalBlobDescriptor); } catch {}
    }
  }

  // Remember the original Blob, not just its URL. A CSP can allow blob: in
  // worker-src but forbid it in script-src: an importScripts/dynamic-import
  // loader then fails asynchronously, outside the Worker's constructor catch.
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
    // Without the registry, blob workers simply stay native.
  }

  const wrapBlobWorker = (scriptURL: string): string | null => {
    if (!state.enabled || !/^blob:/i.test(scriptURL)) {
      return null;
    }
    try {
      const original = blobRegistry.get(scriptURL);
      const strict = original ? blobModes.get(original) : undefined;
      if (!original || strict === undefined) {
        return null;
      }
      const prelude = workerIdentityPrelude();
      return createObjectURL(new NativeBlob([
        strict ? '"use strict";\n' : "",
        `${prelude}\n`,
        original
      ], { type: original.type || "text/javascript" }));
    } catch {
      return null;
    }
  };

  const WrappedWorker = maskAsNative(new Proxy(NativeWorker, {
    construct(target, argumentsList, newTarget) {
      const [scriptURL, options] = argumentsList as [string | URL, WorkerOptions | undefined];
      const wrappedURL = wrapBlobWorker(String(scriptURL));
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

function workerIdentityPrelude(): string {
  return buildWorkerIdentityPrelude({
    profile: state.profile,
    baseUserAgent: spoofingBaseUserAgentString(),
    globalPrivacyControlEnabled: state.globalPrivacyControlEnabled,
    uaSpoofingEnabled: state.uaSpoofingEnabled,
    webglInfoSpoofingEnabled: state.webglInfoSpoofingEnabled
  });
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

function defineMethod(target: object, property: PropertyKey, value: unknown): void {
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

function quantizeMetric(value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return value.toFixed(4);
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
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
