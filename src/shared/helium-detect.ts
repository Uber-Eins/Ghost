import type { GhostSettings } from "./types";

// Helium identifies itself as Google Chrome on purpose (its UA string and
// userAgentData brands are indistinguishable from Chrome), so Ghost never asks
// "is this Helium?". It probes the observable effects of the individual
// ungoogled-chromium / Bromite flags instead and hands a fingerprint surface to
// the browser only when that flag is demonstrably active. Every probe returns
// `null` when it cannot run in the current context.

export interface UserAgentBrand {
  brand: string;
  version: string;
}

export interface HeliumFlagDetection {
  probedAt: number;
  context: "window" | "worker";
  chromiumMajor: string | null;
  brands: UserAgentBrand[];
  platform: string | null;
  hardwareConcurrency: number | null;
  /** `remove-client-hints`: navigator.userAgentData exists but reports no brands. */
  clientHintsRemoved: boolean | null;
  /** `reduced-system-info`: high-entropy client hints resolve to empty strings. */
  systemInfoReduced: boolean | null;
  /** Either of the two flags above; the surface Ghost calls "UA reduction". */
  uaReductionActive: boolean | null;
  webglVendor: string | null;
  webglRenderer: string | null;
  /** `spoof-webgl-info`: the unmasked vendor/renderer pair is one of the fixed presets. */
  webglSpoofed: boolean | null;
  /** `fingerprinting-canvas-measuretext-noise`: measureText differs between same-origin documents. */
  measureTextNoise: boolean | null;
}

export type HeliumSurfaceKey = "disableUserAgentSpoofing" | "disableCanvasMeasureTextSpoofing" | "disableWebglInfoSpoofing";

export const HELIUM_SURFACE_KEYS: readonly HeliumSurfaceKey[] = [
  "disableUserAgentSpoofing",
  "disableCanvasMeasureTextSpoofing",
  "disableWebglInfoSpoofing"
];

// Exact pairs returned by ungoogled-chromium's `spoof-webgl-info` presets
// (patches/extra/ungoogled-chromium/add-flag-to-spoof-webgl-renderer-info.patch).
export const WEBGL_SPOOF_PRESETS: ReadonlyArray<{ vendor: string; renderer: string }> = [
  { vendor: " ", renderer: " " },
  { vendor: "AMD", renderer: "Radeon R9 200 Series, or similar" },
  { vendor: "Apple Inc.", renderer: "Apple GPU" },
  { vendor: "Intel", renderer: "Intel(R) HD Graphics, or similar" },
  { vendor: "Mesa", renderer: "llvmpipe" },
  { vendor: "NVIDIA Corporation", renderer: "NVIDIA GeForce GTX 980, or similar" },
  { vendor: "Qualcomm", renderer: "Adreno (TM) 610" }
];

const HIGH_ENTROPY_HINTS = ["architecture", "bitness", "platformVersion"] as const;

interface UserAgentDataLike {
  brands?: unknown;
  platform?: unknown;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

export function isSpoofedWebglInfo(vendor: string, renderer: string): boolean {
  return WEBGL_SPOOF_PRESETS.some((preset) => preset.vendor === vendor && preset.renderer === renderer);
}

export function classifyClientHints(
  userAgentData: { brands?: unknown } | undefined,
  highEntropyValues: Record<string, unknown> | null
): { brands: UserAgentBrand[]; clientHintsRemoved: boolean | null; systemInfoReduced: boolean | null } {
  if (!userAgentData || typeof userAgentData !== "object") {
    return { brands: [], clientHintsRemoved: null, systemInfoReduced: null };
  }
  const brands = normalizeBrands(userAgentData.brands);
  const clientHintsRemoved = brands.length === 0;
  if (clientHintsRemoved || highEntropyValues === null) {
    return { brands, clientHintsRemoved, systemInfoReduced: null };
  }
  const systemInfoReduced = HIGH_ENTROPY_HINTS.every((hint) => {
    const value = highEntropyValues[hint];
    return typeof value !== "string" || value.length === 0;
  });
  return { brands, clientHintsRemoved, systemInfoReduced };
}

export function uaReductionFromClientHints(clientHintsRemoved: boolean | null, systemInfoReduced: boolean | null): boolean | null {
  if (clientHintsRemoved === true) {
    return true;
  }
  if (systemInfoReduced !== null) {
    return systemInfoReduced;
  }
  return clientHintsRemoved;
}

/** Copies every detected (non-null) flag effect onto the matching delegation switch. */
export function applyHeliumFlagDetection(settings: GhostSettings, detection: HeliumFlagDetection): GhostSettings {
  return {
    ...settings,
    disableUserAgentSpoofing: detection.uaReductionActive ?? settings.disableUserAgentSpoofing,
    disableCanvasMeasureTextSpoofing: detection.measureTextNoise ?? settings.disableCanvasMeasureTextSpoofing,
    disableWebglInfoSpoofing: detection.webglSpoofed ?? settings.disableWebglInfoSpoofing
  };
}

export function sameHeliumSurfaces(left: GhostSettings, right: GhostSettings): boolean {
  return HELIUM_SURFACE_KEYS.every((key) => left[key] === right[key]);
}

export function detectedHeliumFlagNames(detection: HeliumFlagDetection): string[] {
  const names: string[] = [];
  if (detection.webglSpoofed) {
    names.push("spoof-webgl-info");
  }
  if (detection.clientHintsRemoved) {
    names.push("remove-client-hints");
  }
  if (detection.systemInfoReduced) {
    names.push("reduced-system-info");
  }
  if (detection.measureTextNoise) {
    names.push("fingerprinting-canvas-measuretext-noise");
  }
  return names;
}

/** Accepts detection payloads from other extension contexts without trusting their shape. */
export function normalizeHeliumFlagDetection(input: unknown): HeliumFlagDetection {
  const candidate = typeof input === "object" && input !== null ? input as Partial<HeliumFlagDetection> : {};
  const clientHintsRemoved = nullableBoolean(candidate.clientHintsRemoved);
  const systemInfoReduced = nullableBoolean(candidate.systemInfoReduced);
  return {
    probedAt: typeof candidate.probedAt === "number" && Number.isFinite(candidate.probedAt) ? candidate.probedAt : Date.now(),
    context: candidate.context === "worker" ? "worker" : "window",
    chromiumMajor: nullableString(candidate.chromiumMajor),
    brands: normalizeBrands(candidate.brands),
    platform: nullableString(candidate.platform),
    hardwareConcurrency: typeof candidate.hardwareConcurrency === "number" && Number.isFinite(candidate.hardwareConcurrency)
      ? candidate.hardwareConcurrency
      : null,
    clientHintsRemoved,
    systemInfoReduced,
    uaReductionActive: uaReductionFromClientHints(clientHintsRemoved, systemInfoReduced),
    webglVendor: nullableString(candidate.webglVendor),
    webglRenderer: nullableString(candidate.webglRenderer),
    webglSpoofed: nullableBoolean(candidate.webglSpoofed),
    measureTextNoise: nullableBoolean(candidate.measureTextNoise)
  };
}

export async function detectHeliumFlags(): Promise<HeliumFlagDetection> {
  const hasDocument = typeof document !== "undefined" && typeof document.createElement === "function";
  const navigatorLike = globalThis.navigator as (Navigator & { userAgentData?: UserAgentDataLike }) | undefined;
  const userAgentData = navigatorLike?.userAgentData;
  const highEntropyValues = await readHighEntropyValues(userAgentData);
  const clientHints = classifyClientHints(userAgentData, highEntropyValues);
  const webgl = probeWebgl(hasDocument);
  const measureTextNoise = hasDocument ? probeMeasureTextNoise() : null;
  const userAgent = navigatorLike?.userAgent ?? "";

  return {
    probedAt: Date.now(),
    context: hasDocument ? "window" : "worker",
    chromiumMajor: userAgent.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1] ?? null,
    brands: clientHints.brands,
    platform: typeof userAgentData?.platform === "string" && userAgentData.platform
      ? userAgentData.platform
      : navigatorLike?.platform ?? null,
    hardwareConcurrency: typeof navigatorLike?.hardwareConcurrency === "number" ? navigatorLike.hardwareConcurrency : null,
    clientHintsRemoved: clientHints.clientHintsRemoved,
    systemInfoReduced: clientHints.systemInfoReduced,
    uaReductionActive: uaReductionFromClientHints(clientHints.clientHintsRemoved, clientHints.systemInfoReduced),
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    webglSpoofed: webgl.spoofed,
    measureTextNoise
  };
}

async function readHighEntropyValues(userAgentData: UserAgentDataLike | undefined): Promise<Record<string, unknown> | null> {
  if (!userAgentData || typeof userAgentData.getHighEntropyValues !== "function") {
    return null;
  }
  try {
    const values = await userAgentData.getHighEntropyValues([...HIGH_ENTROPY_HINTS]);
    return typeof values === "object" && values !== null ? values : null;
  } catch {
    return null;
  }
}

function probeWebgl(hasDocument: boolean): { vendor: string | null; renderer: string | null; spoofed: boolean | null } {
  const unavailable = { vendor: null, renderer: null, spoofed: null };
  try {
    const gl: WebGLRenderingContext | null = hasDocument
      ? document.createElement("canvas").getContext("webgl")
      : new OffscreenCanvas(1, 1).getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) {
      return unavailable;
    }
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) {
      return unavailable;
    }
    const vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? "");
    const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { vendor, renderer, spoofed: isSpoofedWebglInfo(vendor, renderer) };
  } catch {
    return unavailable;
  }
}

// Bromite's measureText noise picks a fresh scale factor for every Document,
// so two blank same-origin frames disagree with the host page when the flag
// is active. A browser without the flag (or with origin-stable noise) returns
// bit-identical widths, which this probe reports as "not detected".
function probeMeasureTextNoise(): boolean | null {
  const sample = "Ghost measureText probe 0123456789 いろは";
  const font = "20px sans-serif";
  const frames: HTMLIFrameElement[] = [];
  const measure = (doc: Document): number | null => {
    const context = doc.createElement("canvas").getContext("2d");
    if (!context) {
      return null;
    }
    context.font = font;
    return context.measureText(sample).width;
  };
  try {
    const widths = [measure(document)];
    for (let index = 0; index < 2; index += 1) {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
      document.body.append(frame);
      frames.push(frame);
      const frameDocument = frame.contentDocument;
      if (!frameDocument) {
        return null;
      }
      widths.push(measure(frameDocument));
    }
    if (widths.some((width) => width === null)) {
      return null;
    }
    return new Set(widths).size > 1;
  } catch {
    return null;
  } finally {
    for (const frame of frames) {
      frame.remove();
    }
  }
}

function normalizeBrands(value: unknown): UserAgentBrand[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const brand = (entry as { brand?: unknown }).brand;
    const version = (entry as { version?: unknown }).version;
    return typeof brand === "string" && brand ? [{ brand, version: typeof version === "string" ? version : "" }] : [];
  });
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
