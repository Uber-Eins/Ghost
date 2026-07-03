import { localizeDocument } from "../shared/i18n";

const output = document.getElementById("output");
const refresh = document.getElementById("refresh");
const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;

refresh?.addEventListener("click", () => void render());
localizeDocument();
void render();

async function render(): Promise<void> {
  if (!output) {
    return;
  }
  drawCanvas();
  const values: Record<string, unknown> = {
    url: location.href,
    navigator: await navigatorValues(),
    intl: intlValues(),
    date: dateValues(),
    geolocation: await geolocationValue(),
    canvas: canvasValues(),
    webgl: webglValues(),
    audio: await audioValues(),
    headers: "Use a request-header echo page to verify DNR changes after the first resolved visit."
  };
  output.textContent = JSON.stringify(values, null, 2);
}

async function navigatorValues(): Promise<Record<string, unknown>> {
  const nav = navigator as Navigator & {
    userAgentData?: {
      brands: unknown;
      mobile: boolean;
      platform: string;
      getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
    };
    deviceMemory?: number;
  };
  return {
    language: nav.language,
    languages: nav.languages,
    platform: nav.platform,
    vendor: nav.vendor,
    userAgent: nav.userAgent,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    userAgentData: nav.userAgentData
      ? {
        brands: nav.userAgentData.brands,
        mobile: nav.userAgentData.mobile,
        platform: nav.userAgentData.platform,
        highEntropy: await nav.userAgentData.getHighEntropyValues?.(["architecture", "bitness", "platformVersion", "fullVersionList"])
      }
      : null
  };
}

function intlValues(): Record<string, unknown> {
  return {
    dateTime: new Intl.DateTimeFormat().resolvedOptions(),
    number: new Intl.NumberFormat().resolvedOptions(),
    collator: new Intl.Collator().resolvedOptions()
  };
}

function dateValues(): Record<string, unknown> {
  const date = new Date("2026-07-03T12:00:00.000Z");
  return {
    toString: date.toString(),
    toDateString: date.toDateString(),
    toTimeString: date.toTimeString(),
    timezoneOffset: date.getTimezoneOffset(),
    localParts: {
      year: date.getFullYear(),
      month: date.getMonth(),
      date: date.getDate(),
      day: date.getDay(),
      hours: date.getHours(),
      minutes: date.getMinutes()
    },
    locale: date.toLocaleString()
  };
}

function geolocationValue(): Promise<unknown> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      }),
      (error) => resolve({ error: error.message }),
      { maximumAge: 0, timeout: 1000 }
    );
  });
}

function drawCanvas(): void {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0f172a";
  context.font = "28px Arial, sans-serif";
  context.fillText("Ghost canvas test 😀", 16, 48);
  context.fillStyle = "#2563eb";
  context.fillRect(16, 70, 180, 18);
}

function canvasValues(): Record<string, unknown> {
  if (!canvas) {
    return {};
  }
  const context = canvas.getContext("2d");
  return {
    dataUrlHash: hashString(canvas.toDataURL()),
    textWidth: context?.measureText("Ghost canvas test 😀").width,
    pixelHash: context ? hashArray(context.getImageData(0, 0, canvas.width, canvas.height).data) : null
  };
}

function webglValues(): Record<string, unknown> {
  const glCanvas = document.createElement("canvas");
  const gl = glCanvas.getContext("webgl") || glCanvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
  if (!gl) {
    return { available: false };
  }
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_VENDOR_WEBGL: number; UNMASKED_RENDERER_WEBGL: number } | null;
  return {
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    unmaskedVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
    unmaskedRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null
  };
}

async function audioValues(): Promise<Record<string, unknown>> {
  const AudioContextCtor = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!AudioContextCtor) {
    return { available: false };
  }
  const context = new AudioContextCtor(1, 5000, 44100);
  const oscillator = context.createOscillator();
  const compressor = context.createDynamicsCompressor();
  oscillator.type = "triangle";
  oscillator.frequency.value = 1000;
  oscillator.connect(compressor);
  compressor.connect(context.destination);
  oscillator.start(0);
  const buffer = await context.startRendering();
  const data = buffer.getChannelData(0);
  return {
    hash: hashArray(data),
    sample0: data[0],
    sample100: data[100]
  };
}

function hashArray(array: ArrayLike<number>): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < array.length; index += Math.max(1, Math.floor(array.length / 2048))) {
    hash ^= Math.floor((array[index] + 1024) * 1000000);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
