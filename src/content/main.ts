import { fnv1a, mulberry32, stableNumber, stableSeed } from "../shared/hash";
import { canvasFontHasBlockedFamily, sanitizeCanvasFont } from "../shared/fonts";
import { isSupportedPageUrl } from "../shared/internal";
import { fallbackProfileForSite, userAgentForProfile, userAgentMetadataForProfile } from "../shared/profiles";
import { siteKeyFromHostname } from "../shared/site";
import {
  dateFromZonedLocalParts,
  formatSpoofedTimeString,
  getOffsetLabel,
  getTimezoneOffsetMinutes,
  getZonedParts
} from "../shared/timezone";
import type { Profile, ResolvedProfile } from "../shared/types";

declare const __GHOST_CHANNEL__: string;

type NumericArray = Uint8Array<ArrayBufferLike> | Uint8ClampedArray<ArrayBufferLike> | Float32Array<ArrayBufferLike>;

interface GhostState {
  enabled: boolean;
  siteKey: string;
  seed: string;
  profile: Profile;
}

interface IntlInstanceMetadata {
  locale?: string;
  timeZone?: string;
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
const nativeNavigator = snapshotNavigator();
const nativeGeolocation = navigator.geolocation;
const fallbackSiteKey = siteKeyFromHostname(location.hostname);
const state: GhostState = {
  enabled: true,
  siteKey: fallbackSiteKey,
  profile: fallbackProfileForSite(fallbackSiteKey),
  seed: stableSeed(fallbackSiteKey, fallbackProfileForSite(fallbackSiteKey).id)
};
const intlInstanceMetadata = new WeakMap<object, IntlInstanceMetadata>();
const bridgeNonce = createNonce();
let bridgePort: MessagePort | null = null;

if (isSupportedPageUrl(location.href)) {
  install();
  connectBridge();
}

function applyResolvedProfile(resolved: ResolvedProfile): void {
  state.enabled = resolved.enabled;
  state.siteKey = resolved.siteKey;
  state.profile = resolved.profile;
  state.seed = resolved.seed;
}

function install(): void {
  if ((window as unknown as { __ghostInstalled?: boolean }).__ghostInstalled) {
    return;
  }
  (window as unknown as { __ghostInstalled?: boolean }).__ghostInstalled = true;

  patchNavigator();
  patchIntl();
  patchDate();
  patchGeolocation();
  patchFontFaceSet();
  patchCanvas();
  patchWebGL();
  patchAudio();
}

function connectBridge(): void {
  const channel = new MessageChannel();
  bridgePort = channel.port1;
  bridgePort.onmessage = (event) => {
    const data = event.data as { channel?: string; type?: string; nonce?: string; payload?: unknown } | null;
    if (!data || data.channel !== __GHOST_CHANNEL__ || data.type !== "profile" || data.nonce !== bridgeNonce) {
      return;
    }
    applyResolvedProfile(data.payload as ResolvedProfile);
  };
  bridgePort.start();
  window.postMessage({
    channel: __GHOST_CHANNEL__,
    type: "connect",
    nonce: bridgeNonce
  }, "*", [channel.port2]);
  bridgePort.postMessage({
    channel: __GHOST_CHANNEL__,
    type: "resolve",
    nonce: bridgeNonce,
    url: location.href
  });
}

function snapshotNavigator(): Record<string, unknown> {
  const nav = navigator as unknown as Record<string, unknown>;
  return {
    language: nav.language,
    languages: Array.isArray(nav.languages) ? [...nav.languages] : nav.languages,
    platform: nav.platform,
    vendor: nav.vendor,
    userAgent: nav.userAgent,
    userAgentData: nav.userAgentData,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory
  };
}

function patchNavigator(): void {
  defineNavigatorGetter("language", () => state.enabled ? state.profile.locale : nativeNavigator.language);
  defineNavigatorGetter("languages", () => state.enabled ? [...state.profile.languages] : nativeNavigator.languages);
  defineNavigatorGetter("platform", () => state.enabled ? state.profile.platform : nativeNavigator.platform);
  defineNavigatorGetter("vendor", () => state.enabled ? "Google Inc." : nativeNavigator.vendor);
  defineNavigatorGetter("userAgent", () => state.enabled ? userAgentForProfile(state.profile, String(nativeNavigator.userAgent ?? "")) : nativeNavigator.userAgent);
  defineNavigatorGetter("hardwareConcurrency", () => state.enabled ? state.profile.hardwareConcurrency : nativeNavigator.hardwareConcurrency);
  defineNavigatorGetter("deviceMemory", () => state.enabled ? state.profile.deviceMemory : nativeNavigator.deviceMemory);
  defineNavigatorGetter("userAgentData", () => state.enabled ? buildUserAgentData() : nativeNavigator.userAgentData);
}

function defineNavigatorGetter(property: string, getter: () => unknown): void {
  const owner = findDescriptorOwner(Navigator.prototype, property) ?? Navigator.prototype;
  try {
    Object.defineProperty(owner, property, {
      configurable: true,
      enumerable: true,
      get: getter
    });
  } catch {
    try {
      Object.defineProperty(navigator, property, {
        configurable: true,
        enumerable: true,
        get: getter
      });
    } catch {
      // Some Chromium builds keep selected navigator fields locked.
    }
  }
}

function buildUserAgentData(): object {
  const metadata = userAgentMetadataForProfile(state.profile, String(nativeNavigator.userAgent ?? ""));
  const brands = cloneJson(metadata.brands);
  return Object.freeze({
    brands,
    mobile: false,
    platform: metadata.platform,
    getHighEntropyValues: async (hints: string[]) => {
      const values: Record<string, unknown> = {
        brands: cloneJson(metadata.brands),
        mobile: false,
        platform: metadata.platform
      };
      for (const hint of hints) {
        if (hint in metadata) {
          values[hint] = cloneJson(metadata[hint]);
        }
      }
      return values;
    },
    toJSON: () => ({
      brands: cloneJson(metadata.brands),
      mobile: false,
      platform: metadata.platform
    })
  });
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

  const nativeSupportedLocalesOf = (NativeConstructor as unknown as { supportedLocalesOf?: (...args: unknown[]) => unknown }).supportedLocalesOf;
  if (nativeSupportedLocalesOf) {
    Object.defineProperty(Wrapped, "supportedLocalesOf", {
      configurable: true,
      value: (...args: unknown[]) => nativeSupportedLocalesOf.apply(NativeConstructor, args)
    });
  }

  const nativeResolvedOptions = (NativeConstructor.prototype as { resolvedOptions?: () => Record<string, unknown> }).resolvedOptions;
  if (nativeResolvedOptions) {
    Object.defineProperty(NativeConstructor.prototype, "resolvedOptions", {
      configurable: true,
      value: function resolvedOptions(this: object) {
        const result = nativeResolvedOptions.call(this);
        const metadata = intlInstanceMetadata.get(this);
        if (state.enabled && metadata?.locale) {
          result.locale = metadata.locale;
        }
        if (state.enabled && timeZoneOption && metadata?.timeZone) {
          result.timeZone = metadata.timeZone;
        }
        return result;
      }
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

  function GhostDate(this: Date, ...args: unknown[]): string | Date {
    if (!new.target) {
      return new NativeDate().toString();
    }
    return constructDate(args);
  }
  Object.setPrototypeOf(GhostDate, NativeDate);
  GhostDate.prototype = NativeDate.prototype;
  Object.defineProperties(GhostDate, {
    now: { value: NativeDate.now.bind(NativeDate) },
    parse: { value: NativeDate.parse.bind(NativeDate) },
    UTC: { value: NativeDate.UTC.bind(NativeDate) }
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

function constructDate(args: unknown[]): Date {
  if (state.enabled && args.length >= 2) {
    return dateFromZonedLocalParts(
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
  }

  switch (args.length) {
    case 0:
      return new NativeDate();
    case 1:
      return new NativeDate(args[0] as string | number | Date);
    case 2:
      return new NativeDate(args[0] as number, args[1] as number);
    case 3:
      return new NativeDate(args[0] as number, args[1] as number, args[2] as number);
    case 4:
      return new NativeDate(args[0] as number, args[1] as number, args[2] as number, args[3] as number);
    case 5:
      return new NativeDate(args[0] as number, args[1] as number, args[2] as number, args[3] as number, args[4] as number);
    case 6:
      return new NativeDate(args[0] as number, args[1] as number, args[2] as number, args[3] as number, args[4] as number, args[5] as number);
    default:
      return new NativeDate(args[0] as number, args[1] as number, args[2] as number, args[3] as number, args[4] as number, args[5] as number, args[6] as number);
  }
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
  const watchTimers = new Map<number, number>();
  let watchId = 1;
  const geolocation = {
    getCurrentPosition(success: PositionCallback, error?: PositionErrorCallback, options?: PositionOptions) {
      if (!state.enabled && nativeGeolocation) {
        return nativeGeolocation.getCurrentPosition.call(nativeGeolocation, success, error, options);
      }
      queueMicrotask(() => success(buildPosition()));
      return undefined;
    },
    watchPosition(success: PositionCallback, error?: PositionErrorCallback, options?: PositionOptions) {
      if (!state.enabled && nativeGeolocation) {
        return nativeGeolocation.watchPosition.call(nativeGeolocation, success, error, options);
      }
      const id = watchId;
      watchId += 1;
      queueMicrotask(() => success(buildPosition()));
      const timer = window.setInterval(() => success(buildPosition()), Math.max(options?.maximumAge ?? 30000, 1000));
      watchTimers.set(id, timer);
      return id;
    },
    clearWatch(id: number) {
      if (!state.enabled && nativeGeolocation) {
        nativeGeolocation.clearWatch.call(nativeGeolocation, id);
        return;
      }
      const timer = watchTimers.get(id);
      if (timer !== undefined) {
        window.clearInterval(timer);
        watchTimers.delete(id);
      }
    }
  };

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
      latitude: state.profile.latitude + jitterLat,
      longitude: state.profile.longitude + jitterLon,
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
  const canvasPrototype = window.HTMLCanvasElement?.prototype;
  const contextPrototype = window.CanvasRenderingContext2D?.prototype;
  if (contextPrototype) {
    const nativeGetImageData = contextPrototype.getImageData;
    const nativeMeasureText = contextPrototype.measureText;
    Object.defineProperty(contextPrototype, "getImageData", {
      configurable: true,
      value: function getImageData(this: CanvasRenderingContext2D, ...args: Parameters<CanvasRenderingContext2D["getImageData"]>) {
        const imageData = nativeGetImageData.apply(this, args);
        return state.enabled ? noisedImageData(imageData, "getImageData") : imageData;
      }
    });
    Object.defineProperty(contextPrototype, "measureText", {
      configurable: true,
      value: function measureText(this: CanvasRenderingContext2D, text: string) {
        if (!state.enabled) {
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
  }

  if (canvasPrototype) {
    const nativeToDataURL = canvasPrototype.toDataURL;
    const nativeToBlob = canvasPrototype.toBlob;
    Object.defineProperty(canvasPrototype, "toDataURL", {
      configurable: true,
      value: function toDataURL(this: HTMLCanvasElement, ...args: Parameters<HTMLCanvasElement["toDataURL"]>) {
        if (!state.enabled) {
          return nativeToDataURL.apply(this, args);
        }
        const clone = cloneCanvasWithNoise(this, "toDataURL");
        return nativeToDataURL.apply(clone ?? this, args);
      }
    });
    Object.defineProperty(canvasPrototype, "toBlob", {
      configurable: true,
      value: function toBlob(this: HTMLCanvasElement, callback: BlobCallback, type?: string, quality?: number) {
        if (!state.enabled) {
          return nativeToBlob.call(this, callback, type, quality);
        }
        const clone = cloneCanvasWithNoise(this, "toBlob");
        return nativeToBlob.call(clone ?? this, callback, type, quality);
      }
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

function cloneCanvasWithNoise(source: HTMLCanvasElement, purpose: string): HTMLCanvasElement | null {
  try {
    const clone = document.createElement("canvas");
    clone.width = source.width;
    clone.height = source.height;
    const context = clone.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }
    context.drawImage(source, 0, 0);
    const imageData = context.getImageData(0, 0, clone.width, clone.height);
    context.putImageData(noisedImageData(imageData, purpose), 0, 0);
    return clone;
  } catch {
    return null;
  }
}

function noisedImageData(imageData: ImageData, purpose: string): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const random = mulberry32(fnv1a(`${state.seed}:canvas:${purpose}:${imageData.width}x${imageData.height}`));
  const stride = Math.max(4, Math.floor(data.length / 512));
  for (let index = 0; index < data.length; index += stride) {
    const channel = index - (index % 4);
    if (data[channel + 3] === 0) {
      continue;
    }
    data[channel] = clampByte(data[channel] + randomStep(random));
    data[channel + 1] = clampByte(data[channel + 1] + randomStep(random));
    data[channel + 2] = clampByte(data[channel + 2] + randomStep(random));
  }
  return new ImageData(data, imageData.width, imageData.height, { colorSpace: imageData.colorSpace });
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
  const nativeGetExtension = prototype.getExtension;
  const nativeReadPixels = prototype.readPixels as (...args: unknown[]) => unknown;

  Object.defineProperty(prototype, "getParameter", {
    configurable: true,
    value: function getParameter(this: WebGLRenderingContext, parameter: number) {
      if (state.enabled) {
        if (parameter === 0x9245 || parameter === 0x1f00) {
          return state.profile.webglVendor;
        }
        if (parameter === 0x9246 || parameter === 0x1f01) {
          return state.profile.webglRenderer;
        }
      }
      return nativeGetParameter.call(this, parameter);
    }
  });

  Object.defineProperty(prototype, "getExtension", {
    configurable: true,
    value: function getExtension(this: WebGLRenderingContext, name: string) {
      if (state.enabled && name === "WEBGL_debug_renderer_info") {
        return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
      }
      return nativeGetExtension.call(this, name);
    }
  });

  Object.defineProperty(prototype, "readPixels", {
    configurable: true,
    value: function readPixels(this: WebGLRenderingContext, ...args: unknown[]) {
      const result = nativeReadPixels.apply(this, args);
      if (state.enabled) {
        const pixels = findLastArrayBufferView(args);
        if (pixels && "length" in pixels) {
          noiseArrayLike(pixels as NumericArray, "webgl");
        }
      }
      return result;
    }
  });
}

function patchAudio(): void {
  const noisedArrays = new WeakSet<object>();
  const audioBufferPrototype = window.AudioBuffer?.prototype;
  if (audioBufferPrototype) {
    const nativeGetChannelData = audioBufferPrototype.getChannelData;
    const nativeCopyFromChannel = audioBufferPrototype.copyFromChannel;
    Object.defineProperty(audioBufferPrototype, "getChannelData", {
      configurable: true,
      value: function getChannelData(this: AudioBuffer, channel: number) {
        const data = nativeGetChannelData.call(this, channel);
        if (state.enabled && !noisedArrays.has(data)) {
          noiseArrayLike(data as Float32Array<ArrayBufferLike>, `audio:${channel}`);
          noisedArrays.add(data);
        }
        return data;
      }
    });
    Object.defineProperty(audioBufferPrototype, "copyFromChannel", {
      configurable: true,
      value: function copyFromChannel(this: AudioBuffer, destination: Float32Array<ArrayBufferLike>, channelNumber: number, bufferOffset?: number) {
        const result = nativeCopyFromChannel.call(this, destination as Float32Array<ArrayBuffer>, channelNumber, bufferOffset);
        if (state.enabled) {
          noiseArrayLike(destination, `copyFromChannel:${channelNumber}`);
        }
        return result;
      }
    });
  }

  const analyserPrototype = window.AnalyserNode?.prototype;
  if (analyserPrototype) {
    patchAnalyserMethod(analyserPrototype, "getFloatFrequencyData");
    patchAnalyserMethod(analyserPrototype, "getByteFrequencyData");
    patchAnalyserMethod(analyserPrototype, "getByteTimeDomainData");
    patchAnalyserMethod(analyserPrototype, "getFloatTimeDomainData");
  }
}

function patchAnalyserMethod(prototype: AnalyserNode, method: keyof AnalyserNode): void {
  const nativeMethod = prototype[method];
  if (typeof nativeMethod !== "function") {
    return;
  }
  Object.defineProperty(prototype, method, {
    configurable: true,
    value: function analyserMethod(this: AnalyserNode, array: Float32Array | Uint8Array) {
      const result = (nativeMethod as (this: AnalyserNode, array: Float32Array | Uint8Array) => void).call(this, array);
      if (state.enabled) {
        noiseArrayLike(array, `analyser:${String(method)}`);
      }
      return result;
    }
  });
}

function findLastArrayBufferView(values: unknown[]): ArrayBufferView | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (ArrayBuffer.isView(value)) {
      return value;
    }
  }
  return null;
}

function noiseArrayLike(array: NumericArray, purpose: string): void {
  const random = mulberry32(fnv1a(`${state.seed}:${purpose}:${array.length}`));
  const stride = Math.max(1, Math.floor(array.length / 256));
  for (let index = 0; index < array.length; index += stride) {
    if (array instanceof Float32Array) {
      array[index] += (random() - 0.5) * 1e-7;
    } else {
      array[index] = clampByte(array[index] + randomStep(random));
    }
  }
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

function randomStep(random: () => number): number {
  const value = random();
  return value < 0.33 ? -1 : value > 0.66 ? 1 : 0;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
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
