import { wrapNative, wrapNativeMethod } from "../shared/native-wrapper";
import { screenForProfile, rewriteScreenMediaQuery, type ProfileScreen } from "../shared/screen";
import { voicesForProfile, type ProfileVoice } from "../shared/voices";
import { keyboardLayoutForProfile } from "../shared/keyboard";
import { stableNumber, stableSeed } from "../shared/hash";
import { canvasFontHasBlockedFamily, sanitizeCanvasFont } from "../shared/fonts";
import { strictModeForBlobParts } from "../shared/worker-blob";
import { workerIdentityPrelude as buildWorkerIdentityPrelude } from "../shared/worker-prelude";
import { isSupportedPageUrl } from "../shared/internal";
import { appVersionForProfile, effectiveGeolocation, fallbackProfileForSite, navigatorPlatformForProfile, navigatorVendorForProfile, userAgentForProfile, userAgentMetadataForProfile, webgpuAdapterInfoForProfile, webgpuAdapterInfoForWebgl, type WebgpuAdapterInfo } from "../shared/profiles";
import { DEFAULT_EXCLUDED_DOMAINS, DEFAULT_SITE_RULE, isExcludedUrl, siteKeyFromUrl } from "../shared/site";
import { installTimePatches } from "../shared/time-patch";
import { normalizeSettings, resolveProfile } from "../shared/storage";
import type { GhostSettings, Profile, ResolvedProfile } from "../shared/types";

declare const __GHOST_CHANNEL__: string;
declare const __GHOST_RELATED_ONLY__: boolean;

interface GhostState {
  enabled: boolean;
  uaSpoofingEnabled: boolean;
  canvasMeasureTextSpoofingEnabled: boolean;
  webglInfoSpoofingEnabled: boolean;
  mediaDeviceListEnabled: boolean;
  singleScreenEnabled: boolean;
  siteKey: string;
  seed: string;
  profile: Profile;
}

interface BootstrapPayload {
  sessionSalt?: string;
  settings?: GhostSettings;
}

// A related document inherits the protected parent’s resolved policy, not defaults.
interface ParentIdentity {
  policy: GhostState;
  localVoices: () => ProfileVoice[] | null;
  screen: () => ProfileScreen | null;
  isExtended: () => boolean | null;
  mediaDeviceKinds: () => Promise<MediaDeviceKind[] | null>;
  webglInfo: () => { vendor: string; renderer: string };
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
};

const POLICY_LOOKUP = "\u2063ghost-private-policy-v1";

pageInitialization: {
if (__GHOST_RELATED_ONLY__ && isSupportedPageUrl(location.href)) {
  break pageInitialization;
}
const pendingBootstrap = takeBootstrapPayload();
if (readRealmPolicy(window)) {
  break pageInitialization;
}

const parentIdentity = __GHOST_RELATED_ONLY__ ? readParentIdentity() : null;
if (__GHOST_RELATED_ONLY__ && !parentIdentity) {
  break pageInitialization;
}
const initialPageUrl = currentGhostPageUrl();
if (!initialPageUrl || isExcludedUrl(initialPageUrl, pendingBootstrap?.settings?.excludedDomains ?? DEFAULT_EXCLUDED_DOMAINS)) {
  break pageInitialization;
}
const nativeNavigatorDescriptors = snapshotNavigatorDescriptors([
  "language",
  "languages",
  "platform",
  "vendor",
  "userAgent",
  "appVersion",
  "userAgentData",
  "deviceMemory"
]);
const nativeNavigator = snapshotNavigator();
const initialTopLevelUrl = currentTopLevelGhostPageUrl(initialPageUrl);
const fallbackSiteKey = siteKeyFromUrl(initialTopLevelUrl);
const bootstrapProfile = resolveBootstrapPayload(pendingBootstrap, initialPageUrl, initialTopLevelUrl);
const initialPolicy = parentIdentity?.policy ?? bootstrapProfile;
const fallbackProfile = initialPolicy?.profile ?? fallbackProfileForSite(DEFAULT_SITE_RULE);
const initialEnabled = initialPolicy?.enabled ?? true;
const initialUserAgentSpoofingEnabled = initialPolicy?.uaSpoofingEnabled ?? initialEnabled;
const initialCanvasMeasureTextSpoofingEnabled = initialPolicy?.canvasMeasureTextSpoofingEnabled ?? initialEnabled;
const initialWebglInfoSpoofingEnabled = initialPolicy?.webglInfoSpoofingEnabled ?? initialEnabled;
const initialSiteKey = initialPolicy?.siteKey ?? fallbackSiteKey;
const initialSeed = initialPolicy?.seed ?? stableSeed(fallbackSiteKey, fallbackProfile.id);
const state: GhostState = {
  enabled: initialEnabled,
  uaSpoofingEnabled: initialUserAgentSpoofingEnabled,
  canvasMeasureTextSpoofingEnabled: initialCanvasMeasureTextSpoofingEnabled,
  webglInfoSpoofingEnabled: initialWebglInfoSpoofingEnabled,
  mediaDeviceListEnabled: initialPolicy?.mediaDeviceListEnabled ?? initialEnabled,
  singleScreenEnabled: initialPolicy?.singleScreenEnabled ?? initialEnabled,
  siteKey: initialSiteKey,
  profile: fallbackProfile,
  seed: initialSeed
};
const installedSurfaceOwnership = Object.freeze({
  profileProtection: state.enabled,
  userAgent: state.uaSpoofingEnabled,
  canvasMeasureText: state.canvasMeasureTextSpoofingEnabled,
  webglInfo: state.webglInfoSpoofingEnabled,
  mediaDeviceList: state.mediaDeviceListEnabled,
  singleScreen: state.singleScreenEnabled
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
const patchedSpeechRealms = new WeakSet<object>();
const patchedKeyboardRealms = new WeakSet<object>();
const patchedScreenRealms = new WeakSet<object>();
const patchedMediaRealms = new WeakSet<object>();
const patchedWebglRealms = new WeakSet<object>();
const patchedWebgpuRealms = new WeakSet<object>();
const webgpuInfoReaders = new WeakMap<object, () => WebgpuAdapterInfo>();
let refreshScreenProfile: (() => void) | null = null;

install();
if (!parentIdentity) connectBridge();

function readRealmPolicy(realm: Window): GhostState | undefined {
  const toString = (realm as Window & typeof globalThis).Function.prototype.toString;
  return Reflect.get(toString, POLICY_LOOKUP) as GhostState | undefined;
}

function applyResolvedProfile(resolved: ResolvedProfile, requestId: number): void {
  // Persisted user scripts can carry the previous session salt into restored
  // tabs. Keep synchronous noise for this document; do not reload for salt alone.
  if (bootstrapProfile) {
    resolved = { ...resolved, seed: initialSeed };
  }
  const shouldReload = reloadOnProfileChangeRequestIds.delete(requestId) && profileChanged(resolved);
  const surfaceOwnershipChanged = (
    installedSurfaceOwnership.profileProtection !== resolved.enabled
    || installedSurfaceOwnership.userAgent !== resolved.uaSpoofingEnabled
    || installedSurfaceOwnership.canvasMeasureText !== resolved.canvasMeasureTextSpoofingEnabled
    || installedSurfaceOwnership.webglInfo !== resolved.webglInfoSpoofingEnabled
    || installedSurfaceOwnership.mediaDeviceList !== resolved.mediaDeviceListEnabled
    || installedSurfaceOwnership.singleScreen !== resolved.singleScreenEnabled
  );
  state.enabled = resolved.enabled;
  state.uaSpoofingEnabled = resolved.uaSpoofingEnabled;
  state.canvasMeasureTextSpoofingEnabled = resolved.canvasMeasureTextSpoofingEnabled;
  state.webglInfoSpoofingEnabled = resolved.webglInfoSpoofingEnabled;
  state.mediaDeviceListEnabled = resolved.mediaDeviceListEnabled;
  state.singleScreenEnabled = resolved.singleScreenEnabled;
  state.siteKey = resolved.siteKey;
  const screenProfileChanged = profileSignature(state.profile) !== profileSignature(resolved.profile);
  state.profile = resolved.profile;
  state.seed = resolved.seed;
  if (screenProfileChanged) refreshScreenProfile?.();
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
    || initialUserAgentSpoofingEnabled !== resolved.uaSpoofingEnabled
    || initialCanvasMeasureTextSpoofingEnabled !== resolved.canvasMeasureTextSpoofingEnabled
    || initialWebglInfoSpoofingEnabled !== resolved.webglInfoSpoofingEnabled
    || installedSurfaceOwnership.mediaDeviceList !== resolved.mediaDeviceListEnabled
    || installedSurfaceOwnership.singleScreen !== resolved.singleScreenEnabled
    || initialSiteKey !== resolved.siteKey
    || initialSeed !== resolved.seed
    || initialProfileSignature !== profileSignature(resolved.profile)
  ) {
    restoredPageNeedsReload = true;
  }
}

function install(): void {
  if (!installedSurfaceOwnership.profileProtection) return;
  patchFunctionToString();
  patchNavigator();
  patchSpeechSynthesis(window);
  patchKeyboard(window);
  patchScreen(window);
  patchMediaDevices(window);
  patchRelatedWindowAccess();
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
  }
  patchWebGPU(window);
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
      value: maskAsNative(wrapNative(native, (target, receiver, args) => {
        const result = Reflect.apply(target, receiver, args);
        queueMicrotask(() => requestResolvedProfile(true));
        return result;
      }), native)
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
    profile.webglRenderer,
    profile.screenResolution ?? "auto",
    profile.keyboardLayout ?? "auto",
    profile.voices ?? "auto"
  ]);
}

function profileChanged(resolved: ResolvedProfile): boolean {
  return hasResolvedProfile && (
    state.enabled !== resolved.enabled
    || state.uaSpoofingEnabled !== resolved.uaSpoofingEnabled
    || state.canvasMeasureTextSpoofingEnabled !== resolved.canvasMeasureTextSpoofingEnabled
    || state.webglInfoSpoofingEnabled !== resolved.webglInfoSpoofingEnabled
    || state.mediaDeviceListEnabled !== resolved.mediaDeviceListEnabled
    || state.singleScreenEnabled !== resolved.singleScreenEnabled
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
  return resolveProfile(pageUrl, normalizeSettings(payload.settings), Date.now(), topLevelUrl,
    typeof payload.sessionSalt === "string" ? payload.sessionSalt : undefined);
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
    deviceMemory: nav.deviceMemory
  };
}

function readParentIdentity(): ParentIdentity | null {
  for (const candidate of [window.parent, window.opener as Window | null]) {
    try {
      if (!candidate || candidate === window) continue;
      const parentGlobal = candidate as Window & typeof globalThis;
      const policy = readRealmPolicy(parentGlobal);
      if (!policy?.enabled || !policy.profile) continue;
      const nav = parentGlobal.navigator as unknown as Record<string, unknown>;
      return {
        policy,
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
        isExtended: () => {
          try {
            return (parentGlobal.screen as Screen & { isExtended?: boolean }).isExtended ?? null;
          } catch {
            return null;
          }
        },
        mediaDeviceKinds: async () => {
          try {
            return Array.from(await parentGlobal.navigator.mediaDevices.enumerateDevices(), (device) => device.kind);
          } catch {
            return null;
          }
        },
        webglInfo: lazyWebglInfoReader(parentGlobal),
        screen: () => {
          try {
            const { width, height, availWidth, availHeight, availLeft, availTop } = parentGlobal.screen as Screen & ProfileScreen;
            return { width, height, availWidth, availHeight, availLeft, availTop };
          } catch {
            // An opener can navigate cross-origin after this frame installs.
            return null;
          }
        },
        userAgent: policy.uaSpoofingEnabled ? {
          platform: nav.platform, vendor: nav.vendor, userAgent: nav.userAgent, appVersion: nav.appVersion,
          userAgentData: nav.userAgentData as object | undefined
        } : null
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

function patchFunctionToString(realm: Window & typeof globalThis = window): boolean {
  const nativeToString = realm.Function.prototype.toString;
  const maskedToString = new Proxy(nativeToString, {
    apply: (target, receiver, args) => Reflect.apply(target, nativeFunctionSources.get(receiver) ?? receiver, args),
    // The policy lookup adds no property to the native target or the window.
    get: (target, key, receiver) => key === POLICY_LOOKUP && receiver === maskedToString
      ? cloneJson(state)
      : Reflect.get(target, key, receiver)
  });
  nativeFunctionSources.set(maskedToString, nativeToString);
  try {
    Object.defineProperty(realm.Function.prototype, "toString", {
      ...Object.getOwnPropertyDescriptor(realm.Function.prototype, "toString"),
      value: maskedToString
    });
    return true;
  } catch {
    return false;
  }
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

function patchRelatedWindowAccess(): void {
  const prototype = window.HTMLIFrameElement?.prototype;
  for (const key of ["contentWindow", "contentDocument"] as const) {
    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, key);
    const native = descriptor?.get;
    if (!descriptor?.configurable || !native) continue;
    Object.defineProperty(prototype, key, {
      ...descriptor,
      get: maskAsNative(wrapNative(native, (target, receiver, args) => {
        const result = Reflect.apply(target, receiver, args);
        synchronizeRelatedWindow(key === "contentWindow" ? result : result?.defaultView);
        return result;
      }), native)
    });
  }
  const nativeOpen = window.open;
  if (typeof nativeOpen === "function") {
    defineMethod(window, "open", maskAsNative(wrapNative(nativeOpen, (target, receiver, args) => {
      const result = Reflect.apply(target, receiver, args);
      synchronizeRelatedWindow(result);
      return result;
    }), nativeOpen));
  }
}

function synchronizeRelatedWindow(child: (Window & typeof globalThis) | null): void {
  if (!child || child === window || !state.enabled) return;
  try {
    const url = child.location.href;
    if (url !== "about:blank" && url !== "about:srcdoc") return;
    if (child.parent !== window && child.opener !== window) return;
    const parentUrl = isSupportedPageUrl(location.href) ? location.href : initialPageUrl;
    const exclusions = pendingBootstrap?.settings?.excludedDomains ?? DEFAULT_EXCLUDED_DOMAINS;
    if (isExcludedUrl(parentUrl, exclusions) || readRealmPolicy(child)) return;
    // Chromium may not inject into the initial empty document. These surfaces
    // can be synchronized synchronously; navigated documents install themselves.
    if (!patchFunctionToString(child)) return;
    const childPrototype = child.Navigator.prototype;
    const profileProperties = ["language", "languages", "deviceMemory"];
    const uaProperties = ["platform", "vendor", "userAgent", "appVersion", "userAgentData"];
    const parentNavigator = navigator as unknown as Record<string, unknown>;
    let languagesCache: { source: unknown; copy: readonly string[] } | undefined;
    for (const property of state.uaSpoofingEnabled ? [...profileProperties, ...uaProperties] : profileProperties) {
      const owner = findDescriptorOwner(childPrototype, property) ?? childPrototype;
      const descriptor = Object.getOwnPropertyDescriptor(owner, property);
      if (descriptor && !descriptor.configurable) continue;
      if (!(property in parentNavigator)) {
        Reflect.deleteProperty(owner, property);
        continue;
      }
      const mirroredValue = () => {
        const value = parentNavigator[property];
        if (property !== "languages" || !Array.isArray(value)) return value;
        if (languagesCache?.source !== value) {
          languagesCache = { source: value, copy: child.Object.freeze(child.Array.from(value)) };
        }
        return languagesCache.copy;
      };
      Object.defineProperty(owner, property, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get: descriptor?.get ? nativeLookingGetter(descriptor.get, mirroredValue)
          : child.Object.getOwnPropertyDescriptor({ get [property]() { return mirroredValue(); } }, property)!.get
      });
    }
    if (state.uaSpoofingEnabled) patchSpeechSynthesis(child);
    patchKeyboard(child);
    patchScreen(child);
    if (state.mediaDeviceListEnabled) patchMediaDevices(child);
    if (state.webglInfoSpoofingEnabled) patchWebGL(child);
    patchWebGPU(child);
  } catch {
    // Cross-origin realms are inaccessible and keep their own policy.
  }
}

function patchScreen(realm: Window & typeof globalThis): void {
  const prototype = realm.Screen?.prototype;
  if (!prototype || patchedScreenRealms.has(realm)) return;
  patchedScreenRealms.add(realm);
  // Snapshot once, not on resize. Only an actual profile change invalidates it.
  const dpr = realm.devicePixelRatio;
  const derive = (): ProfileScreen | null => screenForProfile(state.profile, realm.navigator.platform, { width: realm.outerWidth, height: realm.outerHeight }, dpr);
  let screen = derive();
  if (realm === window && !parentIdentity) refreshScreenProfile = () => { screen = derive(); };
  const reportedScreen = (): ProfileScreen | null => {
    if (!state.enabled) return null;
    if (realm !== window) {
      // Direct child access must mirror this document, not the child's fallback
      // profile or iframe viewport. Parent getters also handle native UA mode.
      const { width, height, availWidth, availHeight, availLeft, availTop } = window.screen as Screen & ProfileScreen;
      return { width, height, availWidth, availHeight, availLeft, availTop };
    }
    if (parentIdentity) return parentIdentity.screen();
    // The derivation already follows the platform this document reports (which
    // is native when the User-Agent is delegated); explicit sizes always apply.
    return screen;
  };
  for (const property of ["width", "height", "availWidth", "availHeight", "availLeft", "availTop", "isExtended"] as const) {
    if (property === "isExtended" && !parentIdentity && !installedSurfaceOwnership.singleScreen) continue;
    const descriptor = realm.Object.getOwnPropertyDescriptor(prototype, property);
    const nativeGetter = descriptor?.get;
    // availLeft/availTop and isExtended are not exposed by every browser.
    if (!descriptor || !nativeGetter) continue;
    realm.Object.defineProperty(prototype, property, {
      ...descriptor,
      get: maskAsNative(wrapNative(nativeGetter, function apply(target, receiver, args) {
        const nativeValue = Reflect.apply(target, receiver, args);
        if (property === "isExtended") {
          if (!state.enabled) return nativeValue;
          if (realm !== window) return (window.screen as Screen & { isExtended?: boolean }).isExtended ?? nativeValue;
          return parentIdentity ? parentIdentity.isExtended() ?? nativeValue : state.singleScreenEnabled ? false : nativeValue;
        }
        const reported = reportedScreen()?.[property];
        if (reported !== undefined) return reported;
        // A native multi-monitor layout shows through availLeft/availTop (for
        // example 1920 for a screen right of a 1920-wide one); a single screen
        // always starts at the origin.
        if ((property === "availLeft" || property === "availTop") && state.enabled
          && realm === window && !parentIdentity && state.singleScreenEnabled) return 0;
        return nativeValue;
      }), nativeGetter)
    });
  }
  const nativeMatchMedia = realm.matchMedia;
  const mediaPrototype = realm.MediaQueryList?.prototype;
  const descriptor = mediaPrototype && realm.Object.getOwnPropertyDescriptor(mediaPrototype, "media");
  const nativeMedia = descriptor?.get;
  if (typeof nativeMatchMedia !== "function" || !mediaPrototype || !descriptor || !nativeMedia) return;
  const originalQueries = new WeakMap<object, string>();
  realm.Object.defineProperty(mediaPrototype, "media", {
    ...descriptor,
    get: maskAsNative(wrapNative(nativeMedia, function apply(target, receiver, args) {
      const nativeValue = Reflect.apply(target, receiver, args);
      return originalQueries.get(receiver) ?? nativeValue;
    }), nativeMedia)
  });
  defineMethod(realm, "matchMedia", maskAsNative(wrapNative(nativeMatchMedia, function apply(target, receiver, args) {
    const screen = reportedScreen();
    if (!screen || !args.length || typeof args[0] === "symbol") return Reflect.apply(target, receiver, args);
    const query = String(args[0]);
    const rewritten = rewriteScreenMediaQuery(query, screen);
    const result = Reflect.apply(target, receiver, [rewritten, ...args.slice(1)]) as MediaQueryList;
    if (rewritten !== query) {
      // Report the browser's own serialization of the page's query, not the
      // raw string, so casing and whitespace normalise exactly as native.
      const serialized = Reflect.apply(nativeMedia, Reflect.apply(target, receiver, [query, ...args.slice(1)]), []) as string;
      originalQueries.set(result, serialized);
    }
    return result;
  }), nativeMatchMedia));
}

function patchMediaDevices(realm: Window & typeof globalThis): void {
  if (!state.mediaDeviceListEnabled) return;
  const prototype = realm.MediaDevices?.prototype;
  const devicePrototype = realm.MediaDeviceInfo?.prototype;
  const inputPrototype = realm.InputDeviceInfo?.prototype;
  const nativeEnumerate = prototype?.enumerateDevices;
  if (!nativeEnumerate || !devicePrototype || !inputPrototype || patchedMediaRealms.has(realm)) return;
  patchedMediaRealms.add(realm);
  const fakeDevices = new WeakMap<object, MediaDeviceKind>();
  for (const property of ["deviceId", "kind", "label", "groupId"] as const) {
    const descriptor = realm.Object.getOwnPropertyDescriptor(devicePrototype, property);
    const nativeGetter = descriptor?.get;
    if (!descriptor || !nativeGetter) continue;
    realm.Object.defineProperty(devicePrototype, property, {
      ...descriptor,
      get: maskAsNative(wrapNative(nativeGetter, function apply(target, receiver, args) {
        const kind = fakeDevices.get(receiver);
        return kind ? (property === "kind" ? kind : "") : Reflect.apply(target, receiver, args);
      }), nativeGetter)
    });
  }
  const nativeToJSON = devicePrototype.toJSON;
  if (typeof nativeToJSON === "function") {
    defineMethod(devicePrototype, "toJSON", maskAsNative(wrapNative(nativeToJSON, function apply(target, receiver, args) {
      const kind = fakeDevices.get(receiver);
      return kind ? realm.Object.assign(new realm.Object(), { deviceId: "", kind, label: "", groupId: "" })
        : Reflect.apply(target, receiver, args);
    }), nativeToJSON));
  }
  const nativeCapabilities = inputPrototype.getCapabilities;
  if (typeof nativeCapabilities === "function") {
    defineMethod(inputPrototype, "getCapabilities", maskAsNative(wrapNative(nativeCapabilities, function apply(target, receiver, args) {
      const kind = fakeDevices.get(receiver);
      return kind && kind !== "audiooutput" ? new realm.Object() : Reflect.apply(target, receiver, args);
    }), nativeCapabilities));
  }
  defineMethod(prototype, "enumerateDevices", maskAsNative(wrapNative(nativeEnumerate, function apply(target, receiver, args) {
    // Native validation and permission/policy failures must remain intact.
    const promise = Reflect.apply(target, receiver, args) as Promise<MediaDeviceInfo[]>;
    return promise.then(async (devices) => {
      if (!state.enabled || !state.mediaDeviceListEnabled || devices.some((device) => device.label !== "" || device.deviceId !== "")) return devices;
      if (parentIdentity) {
        const kinds = await parentIdentity.mediaDeviceKinds();
        if (kinds && kinds.length === devices.length && kinds.every((kind, index) => devices[index].kind === kind)) return devices;
      }
      return realm.Array.from(["audioinput", "videoinput", "audiooutput"] as const, (kind) => {
        const nativeDevice = devices.find((device) => device.kind === kind);
        if (nativeDevice) return nativeDevice;
        const fake = realm.Object.create(kind === "audiooutput" ? devicePrototype : inputPrototype) as MediaDeviceInfo;
        fakeDevices.set(fake, kind);
        return fake;
      });
    });
  }), nativeEnumerate));
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
  const active = (): boolean => state.enabled && state.uaSpoofingEnabled
    && (parentIdentity !== null || (state.profile.uaMode !== "native" && realm.navigator.platform !== "MacIntel"));
  for (const property of ["name", "lang", "voiceURI", "localService", "default"] as const) {
    const descriptor = realm.Object.getOwnPropertyDescriptor(voicePrototype, property);
    const nativeGetter = descriptor?.get;
    if (!descriptor || !nativeGetter) continue;
    realm.Object.defineProperty(voicePrototype, property, {
      ...descriptor,
      get: maskAsNative(wrapNative(nativeGetter, function apply(target, receiver, args) {
        const voice = fakeVoices.get(receiver);
        return voice ? voice[property] : Reflect.apply(target, receiver, args);
      }), nativeGetter)
    });
  }
  defineMethod(synthPrototype, "getVoices", maskAsNative(wrapNative(nativeGetVoices, function apply(target, receiver, args) {
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
  }), nativeGetVoices));
  const descriptor = realm.Object.getOwnPropertyDescriptor(utterancePrototype, "voice");
  const nativeGetter = descriptor?.get;
  const nativeSetter = descriptor?.set;
  if (!descriptor || !nativeGetter || !nativeSetter) return;
  realm.Object.defineProperty(utterancePrototype, "voice", {
    ...descriptor,
    get: maskAsNative(wrapNative(nativeGetter, function apply(target, receiver, args) {
      const nativeVoice = Reflect.apply(target, receiver, args);
      return active() ? assignedVoices.get(receiver) ?? nativeVoice : nativeVoice;
    }), nativeGetter),
    set: maskAsNative(wrapNative(nativeSetter, function apply(target, receiver, args) {
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
      defineMethod(iteratorPrototype, "next", maskAsNative(wrapNative(nativeNext, function apply(target, iteratorReceiver, args) {
        const fake = fakeIterators.get(iteratorReceiver);
        return fake ? fake.next() : Reflect.apply(target, iteratorReceiver, args);
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
    const wrapper = methodWrappers.get(nativeMethod) ?? maskAsNative(wrapNative(nativeMethod, function apply(target, receiver, args) {
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
    }), nativeMethod);
    methodWrappers.set(nativeMethod, wrapper);
    defineMethod(prototype, property, wrapper);
  }
  const sizeDescriptor = realm.Object.getOwnPropertyDescriptor(prototype, "size");
  const nativeSize = sizeDescriptor?.get;
  if (sizeDescriptor && nativeSize) {
    realm.Object.defineProperty(prototype, "size", {
      ...sizeDescriptor,
      get: maskAsNative(wrapNative(nativeSize, function apply(target, receiver, args) {
        const map = fakeMaps.get(receiver);
        return map ? map.size : Reflect.apply(target, receiver, args);
      }), nativeSize)
    });
  }
  defineMethod(keyboardPrototype, "getLayoutMap", maskAsNative(wrapNative(nativeGetLayoutMap, function apply(target, receiver, args) {
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
    : Object.getOwnPropertyDescriptor({ get [property]() { return getter(); } }, property)!.get;
  try {
    Object.defineProperty(owner, property, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get: installedGetter
    });
  } catch {
    // Leave locked prototype properties native; never shadow them on navigator.
  }
}

function nativeLookingGetter(nativeGetter: () => unknown, value: () => unknown): () => unknown {
  return maskAsNative(wrapNative(nativeGetter, function apply(target, thisArgument, argumentsList) {
    // Preserve the native getter's receiver validation before substituting
    // the configured value. Proxies stringify with a native-code surface.
    Reflect.apply(target, thisArgument, argumentsList);
    return value();
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
        get: snapshot?.descriptor.get
          ? nativeLookingGetter(snapshot.descriptor.get, () => undefined)
          : Object.getOwnPropertyDescriptor({ get [property]() { return undefined; } }, property)!.get
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
      value: maskAsNative(wrapNativeMethod(nativeUaDataPrototype?.getHighEntropyValues, async function getHighEntropyValues(hints: string[]) {
        return cloneJson(await source.getHighEntropyValues(hints));
      }), nativeUaDataPrototype?.getHighEntropyValues)
    },
    toJSON: {
      value: maskAsNative(wrapNativeMethod(nativeUaDataPrototype?.toJSON, { toJSON() {
        return cloneJson(low);
      } }.toJSON), nativeUaDataPrototype?.toJSON)
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
      value: maskAsNative(wrapNativeMethod(nativeUaDataPrototype?.getHighEntropyValues, async function getHighEntropyValues(hints: string[]) {
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
      }), nativeUaDataPrototype?.getHighEntropyValues)
    },
    toJSON: {
      value: maskAsNative(wrapNativeMethod(nativeUaDataPrototype?.toJSON, { toJSON() {
        return {
          brands: cloneJson(metadata.brands),
          mobile: metadata.mobile,
          platform: metadata.platform
        };
      } }.toJSON), nativeUaDataPrototype?.toJSON)
    }
  });
  Object.freeze(value);
  cachedUserAgentData = { key: cacheKey, value };
  return value;
}

function patchGeolocation(): void {
  const globals = window as Window & {
    GeolocationCoordinates?: { prototype: GeolocationCoordinates };
    GeolocationPosition?: { prototype: GeolocationPosition };
  };
  const coordsPrototype = globals.GeolocationCoordinates?.prototype;
  const positionPrototype = globals.GeolocationPosition?.prototype;
  const geolocationPrototype = window.Geolocation?.prototype;
  if (!coordsPrototype || !positionPrototype || !geolocationPrototype) {
    return;
  }

  const coords = Object.getOwnPropertyDescriptor(positionPrototype, "coords")?.get;
  if (!coords) return;
  const coordinateKeys = ["latitude", "longitude", "accuracy", "altitude", "altitudeAccuracy", "heading", "speed"] as const;
  const getters = coordinateKeys.map((key) => Object.getOwnPropertyDescriptor(coordsPrototype, key));
  if (getters.some((descriptor) => !descriptor?.configurable || !descriptor.get)) {
    return;
  }
  const coordinates = new WeakMap<GeolocationCoordinates, Record<typeof coordinateKeys[number], number | null>>();
  // Keep the browser's branded objects; only their reported coordinate fields change.
  for (const [index, key] of coordinateKeys.entries()) {
    const descriptor = getters[index]!;
    const native = descriptor.get!;
    Object.defineProperty(coordsPrototype, key, {
      ...descriptor,
      get: maskAsNative(wrapNative(native, (target, receiver, args) => {
        const replacement = coordinates.get(receiver);
        return replacement ? replacement[key] : Reflect.apply(target, receiver, args);
      }), native)
    });
  }
  for (const prototype of [coordsPrototype, positionPrototype]) {
    const native = prototype.toJSON;
    if (typeof native !== "function") continue;
    defineMethod(prototype, "toJSON", maskAsNative(wrapNative(native, (target, receiver, args) => {
      const json = Reflect.apply(target, receiver, args);
      const replacement = coordinates.get(prototype === coordsPrototype ? receiver : coords.call(receiver));
      if (replacement) Object.assign(prototype === coordsPrototype ? json : json.coords, replacement);
      return json;
    }), native));
  }
  for (const name of ["getCurrentPosition", "watchPosition"] as const) {
    const native = geolocationPrototype[name];
    defineMethod(geolocationPrototype, name, maskAsNative(wrapNative(native, (target, receiver, args) => {
      const success = args[0];
      if (typeof success === "function") {
        args[0] = function (this: unknown, position: GeolocationPosition) {
          if (state.enabled) {
            coordinates.set(coords.call(position), {
              ...effectiveGeolocation(state.profile, state.seed),
              altitude: null, altitudeAccuracy: null, heading: null, speed: null
            });
          }
          return Reflect.apply(success, this, [position]);
        };
      }
      return Reflect.apply(target, receiver, args);
    }), native));
  }
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

  defineMethod(prototype, "check", maskAsNative(wrapNative(nativeCheck, (_target, receiver, args) => Reflect.apply(patchedCheck, receiver, args)), nativeCheck));
  defineMethod(prototype, "load", maskAsNative(wrapNative(nativeLoad, (_target, receiver, args) => Reflect.apply(patchedLoad, receiver, args)), nativeLoad));
  if (fontSet) {
    defineMethod(fontSet, "check", patchedCheck);
    defineMethod(fontSet, "load", patchedLoad);
  }
}

function patchCanvas(): void {
  const contextPrototype = window.CanvasRenderingContext2D?.prototype;
  if (contextPrototype) {
    const nativeMeasureText = contextPrototype.measureText;
    Object.defineProperty(contextPrototype, "measureText", {
      configurable: true,
      value: maskAsNative(wrapNative(nativeMeasureText, (target, receiver, args) => {
        const context = receiver as CanvasRenderingContext2D;
        const [text] = args as [string];
        if (!state.enabled) {
          return Reflect.apply(target, receiver, args);
        }
        const font = context.font;
        const sanitizedFont = sanitizeCanvasFont(font, state.profile, currentDocumentFontFamilies());
        const metrics = sanitizedFont === font ? Reflect.apply(target, receiver, args) : measureTextWithFont(context, nativeMeasureText, text, sanitizedFont);
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
      }), nativeMeasureText)
    });
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

function patchWebGL(realm: Window & typeof globalThis = window): void {
  if (patchedWebglRealms.has(realm)) return;
  patchedWebglRealms.add(realm);
  patchWebGLPrototype(realm.WebGLRenderingContext?.prototype);
  patchWebGLPrototype(realm.WebGL2RenderingContext?.prototype);
}

function patchWebGLPrototype(prototype: WebGLRenderingContext | WebGL2RenderingContext | undefined): void {
  if (!prototype) {
    return;
  }
  const nativeGetParameter = prototype.getParameter;
  Object.defineProperty(prototype, "getParameter", {
    configurable: true,
    writable: true,
    value: maskAsNative(wrapNative(nativeGetParameter, function apply(target, thisArgument, argumentsList) {
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
          return parentIdentity ? parentIdentity.webglInfo().vendor : state.profile.webglVendor;
        }
        if (parameter === 0x9246) {
          return parentIdentity ? parentIdentity.webglInfo().renderer : state.profile.webglRenderer;
        }
      }
      return nativeValue;
    }), nativeGetParameter)
  });
}

// Capture the realm's public WebGL methods without allocating a context at
// document_start. A related frame reads its parent's installed public surface.
function lazyWebglInfoReader(realm: Window & typeof globalThis): () => { vendor: string; renderer: string } {
  const document = realm.document;
  const createElement = document.createElement;
  const getContext = realm.HTMLCanvasElement?.prototype.getContext;
  const prototypes = [realm.WebGLRenderingContext?.prototype, realm.WebGL2RenderingContext?.prototype];
  const methods = prototypes.map((prototype) => ({
    getParameter: prototype?.getParameter,
    getExtension: prototype?.getExtension
  }));
  let cached: { vendor: string; renderer: string } | undefined;
  return () => {
    if (cached) return cached;
    cached = { vendor: "", renderer: "" };
    try {
      if (realm.document !== document) return cached;
      const canvas = Reflect.apply(createElement, document, ["canvas"]);
      for (const [index, kind] of ["webgl", "webgl2"].entries()) {
        const context = getContext && Reflect.apply(getContext, canvas, [kind]);
        const { getParameter, getExtension } = methods[index];
        if (!context || !getParameter || !getExtension) continue;
        const extension = Reflect.apply(getExtension, context, ["WEBGL_debug_renderer_info"]);
        if (!extension) continue;
        const vendor = Reflect.apply(getParameter, context, [0x9245]);
        const renderer = Reflect.apply(getParameter, context, [0x9246]);
        if (typeof vendor === "string" && typeof renderer === "string") cached = { vendor, renderer };
        break;
      }
    } catch {
      // Failed or inaccessible WebGL must never expose the native WebGPU GPU.
    }
    return cached;
  };
}

function webgpuInfoForRealm(realm: Window & typeof globalThis): () => WebgpuAdapterInfo {
  const existing = webgpuInfoReaders.get(realm);
  if (existing) return existing;
  const readWebgl = parentIdentity?.webglInfo ?? lazyWebglInfoReader(realm);
  let delegated: WebgpuAdapterInfo | undefined;
  const read = (): WebgpuAdapterInfo => {
    if (!parentIdentity && state.webglInfoSpoofingEnabled) {
      return webgpuAdapterInfoForProfile(state.profile) ?? webgpuAdapterInfoForWebgl("", "");
    }
    if (!delegated) {
      const { vendor, renderer } = readWebgl();
      delegated = webgpuAdapterInfoForWebgl(vendor, renderer);
    }
    return delegated;
  };
  webgpuInfoReaders.set(realm, read);
  return read;
}

// GPUAdapterInfo covers adapter.info, device.adapterInfo and the legacy
// requestAdapterInfo(). Features and limits remain native.
function patchWebGPU(realm: Window & typeof globalThis): void {
  const adapterInfoPrototype = (realm as unknown as { GPUAdapterInfo?: { prototype: object } }).GPUAdapterInfo?.prototype;
  if (!adapterInfoPrototype || patchedWebgpuRealms.has(realm)) return;
  patchedWebgpuRealms.add(realm);
  const readInfo = webgpuInfoForRealm(realm);
  for (const property of ["vendor", "architecture", "device", "description"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(adapterInfoPrototype, property);
    const nativeGetter = descriptor?.get;
    if (!nativeGetter) continue;
    try {
      Object.defineProperty(adapterInfoPrototype, property, {
        ...descriptor,
        get: nativeMappingGetter(nativeGetter, (nativeValue) => state.enabled ? readInfo()[property] : nativeValue)
      });
    } catch {
      // Some builds freeze WebGPU prototypes; the WebGL surface is still covered.
    }
  }
}

function nativeMappingGetter(nativeGetter: () => unknown, map: (nativeValue: unknown) => unknown): () => unknown {
  return maskAsNative(wrapNative(nativeGetter, function apply(target, thisArgument, argumentsList) {
    return map(Reflect.apply(target, thisArgument, argumentsList));
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
      value: maskAsNative(wrapNative(nativeCreateObjectURL, function apply(target, thisArgument, argumentsList) {
        const url = Reflect.apply(target, thisArgument, argumentsList) as string;
        const source = argumentsList[0];
        if (source instanceof NativeBlob && blobRegistry.size < 512) {
          blobRegistry.set(url, source);
        }
        return url;
      }), nativeCreateObjectURL)
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: maskAsNative(wrapNative(nativeRevokeObjectURL, function apply(target, thisArgument, argumentsList) {
        blobRegistry.delete(String(argumentsList[0]));
        return Reflect.apply(target, thisArgument, argumentsList);
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
  const mirrored = parentIdentity?.webglInfo();
  return buildWorkerIdentityPrelude({
    profile: mirrored ? { ...state.profile, webglVendor: mirrored.vendor, webglRenderer: mirrored.renderer } : state.profile,
    baseUserAgent: spoofingBaseUserAgentString(),
    uaSpoofingEnabled: state.uaSpoofingEnabled,
    webglInfoSpoofingEnabled: state.webglInfoSpoofingEnabled,
    webgpuAdapterInfo: webgpuInfoForRealm(window)()
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
