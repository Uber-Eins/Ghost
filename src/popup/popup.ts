import { localizeDocument, t } from "../shared/i18n";
import { FINGERPRINT_TEST_URL } from "../shared/fingerprint-test";
import { applyHeliumFlagDetection, detectHeliumFlags, sameHeliumSurfaces } from "../shared/helium-detect";
import { utcOffsetLabel, utcOffsetMinutes } from "../shared/timezone";
import { openUserScriptsSettingsPage, repairContentBootstrap } from "../background/bootstrap";
import type { PopupState, Profile, RuntimeRequest, RuntimeResponse } from "../shared/types";

type StatusTone = "ok" | "warn" | "danger" | "muted";

const elements = {
  popup: byId("popup", "main.popup"),
  build: byId("build"),
  statusText: byId("statusText"),
  protectionWarning: byId("protectionWarning"),
  enableUserScripts: byId<HTMLButtonElement>("enableUserScripts"),
  pausedBanner: byId("pausedBanner"),
  pausedText: byId("pausedText"),
  resume: byId<HTMLButtonElement>("resume"),
  globalEnabled: byId<HTMLInputElement>("globalEnabled"),
  siteEnabled: byId<HTMLInputElement>("siteEnabled"),
  site: byId("site"),
  siteHint: byId("siteHint"),
  profile: byId<HTMLSelectElement>("profile"),
  autoPill: byId("autoPill"),
  autoPillText: byId("autoPillText"),
  factLocale: byId("factLocale"),
  factTimezone: byId("factTimezone"),
  factCoords: byId("factCoords"),
  factPlatform: byId("factPlatform"),
  regenerate: byId<HTMLButtonElement>("regenerate"),
  disableHour: byId<HTMLButtonElement>("disableHour"),
  options: byId<HTMLButtonElement>("options"),
  test: byId<HTMLButtonElement>("test"),
  version: byId("version"),
  error: byId("error")
};

let currentState: PopupState | null = null;

void initialize().catch(showError);

async function initialize(): Promise<void> {
  localizeDocument();
  elements.version.textContent = `v${chrome.runtime.getManifest().version}`;
  currentState = await loadAndRepairPopupState();
  render();
  void synchronizeHeliumFlags().catch(() => undefined);

  elements.globalEnabled.addEventListener("change", () => {
    runMutation({ type: "setGlobalEnabled", enabled: elements.globalEnabled.checked });
  });
  elements.siteEnabled.addEventListener("change", () => {
    if (!currentState) {
      return;
    }
    runMutation({
      type: "setSiteEnabled",
      siteKey: currentState.siteKey,
      url: currentState.url,
      enabled: elements.siteEnabled.checked
    });
  });
  elements.profile.addEventListener("change", () => {
    if (!currentState) {
      return;
    }
    runMutation({ type: "setSiteProfile", siteKey: currentState.siteKey, profileId: elements.profile.value });
  });
  elements.regenerate.addEventListener("click", () => {
    if (!currentState) {
      return;
    }
    elements.regenerate.classList.add("spin");
    runMutation({ type: "regenerateSiteProfile", siteKey: currentState.siteKey });
  });
  elements.disableHour.addEventListener("click", () => {
    runMutation({ type: "setTemporaryDisable", durationMs: 60 * 60 * 1000 });
  });
  elements.resume.addEventListener("click", () => {
    runMutation({ type: "setTemporaryDisable", durationMs: 0 });
  });
  elements.options.addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.enableUserScripts.addEventListener("click", () => {
    void openUserScriptsSettingsPage().catch(showError);
  });
  elements.test.addEventListener("click", () => {
    if (window.confirm(t("fingerprintTestExternalConfirm"))) {
      void chrome.tabs.create({ url: FINGERPRINT_TEST_URL });
    }
  });
}

async function refresh(): Promise<void> {
  currentState = await loadAndRepairPopupState();
  render();
}

async function loadAndRepairPopupState(): Promise<PopupState> {
  const state = await loadPopupState();
  if (state.earlyBootstrapAvailable) {
    return state;
  }
  try {
    const repaired = await repairContentBootstrap(state.settings, state.build);
    return repaired ? { ...state, earlyBootstrapAvailable: true } : state;
  } catch {
    // The warning remains visible until synchronous registration succeeds.
    return state;
  }
}

// Keeps the Helium delegation switches aligned with the flags that are
// actually active, using this popup document as the probe context.
async function synchronizeHeliumFlags(): Promise<void> {
  const state = currentState;
  if (!state?.settings.heliumFlagSync) {
    return;
  }
  const detection = await detectHeliumFlags();
  if (sameHeliumSurfaces(state.settings, applyHeliumFlagDetection(state.settings, detection))) {
    return;
  }
  await sendMessage({ type: "syncHeliumFlags", detection });
  await refresh();
}

function runMutation(message: RuntimeRequest): void {
  setBusy(true);
  void sendMessage(message)
    .then(refresh)
    .catch(showError)
    .finally(() => setBusy(false));
}

function setBusy(busy: boolean): void {
  elements.popup.setAttribute("aria-busy", String(busy));
  if (!busy) {
    elements.regenerate.classList.remove("spin");
  }
}

function showError(error: unknown): void {
  elements.error.textContent = error instanceof Error ? error.message : String(error);
  elements.error.hidden = false;
}

async function loadPopupState(): Promise<PopupState> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return sendMessage<PopupState>({ type: "getPopupState", url: tab?.url ?? "" });
}

function render(): void {
  const state = currentState;
  if (!state) {
    return;
  }
  elements.error.hidden = true;

  const pausedUntil = temporaryPauseEnd(state);
  const status = computeStatus(state, pausedUntil);
  elements.popup.dataset.tone = status.tone;
  elements.popup.dataset.supported = String(state.supportedPage);
  elements.statusText.textContent = status.text;

  elements.build.textContent = state.build === "advanced" ? t("buildAdvancedLabel") : t("buildLiteLabel");
  elements.protectionWarning.hidden = state.earlyBootstrapAvailable;
  elements.pausedBanner.hidden = pausedUntil === null;
  if (pausedUntil !== null) {
    elements.pausedText.textContent = `${t("pausedUntil")} ${formatTime(pausedUntil)}`;
  }

  elements.globalEnabled.checked = state.settings.enabled;
  elements.siteEnabled.checked = state.enabledForSite;
  elements.siteEnabled.disabled = !state.supportedPage;
  elements.site.textContent = state.siteKey || "-";
  elements.site.title = state.url;
  elements.siteHint.textContent = siteHint(state);

  elements.profile.disabled = !state.supportedPage;
  elements.regenerate.disabled = !state.supportedPage;
  elements.disableHour.disabled = pausedUntil !== null;
  elements.test.disabled = !state.earlyBootstrapAvailable;
  elements.profile.replaceChildren(...state.profiles.map(optionForProfile));
  elements.profile.value = state.profile.id;
  renderProfile(state);
}

function computeStatus(state: PopupState, pausedUntil: number | null): { tone: StatusTone; text: string } {
  if (!state.earlyBootstrapAvailable) {
    return { tone: "danger", text: t("unprotected") };
  }
  if (!state.settings.enabled) {
    return { tone: "muted", text: t("protectionOff") };
  }
  if (pausedUntil !== null) {
    return { tone: "warn", text: `${t("pausedUntil")} ${formatTime(pausedUntil)}` };
  }
  if (!state.supportedPage) {
    return { tone: "muted", text: t("unsupportedPage") };
  }
  if (!state.enabledForSite) {
    return { tone: "muted", text: t("siteOff") };
  }
  return { tone: "ok", text: t("protected") };
}

function siteHint(state: PopupState): string {
  if (!state.supportedPage) {
    return state.fileAccessRequired ? t("fileAccessRequired") : t("unsupportedPageHint");
  }
  if (!state.settings.enabled) {
    return t("protectionOffHint");
  }
  return state.enabledForSite ? t("siteProtectedHint") : t("siteExcluded");
}

function temporaryPauseEnd(state: PopupState): number | null {
  const until = state.settings.temporaryDisabledUntil;
  return typeof until === "number" && until > Date.now() ? until : null;
}

function optionForProfile(profile: Profile): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = profile.id;
  option.textContent = profile.label;
  return option;
}

function renderProfile(state: PopupState): void {
  const profile = state.profile;
  const automaticLocation = state.settings.automaticLocationEnabled ? state.settings.automaticLocation : null;

  elements.autoPill.hidden = !state.settings.automaticLocationEnabled;
  if (state.settings.automaticLocationEnabled) {
    const place = automaticLocation
      ? [automaticLocation.city, automaticLocation.countryCode].filter(Boolean).join(", ")
      : t("automaticLocationRefreshing");
    elements.autoPillText.textContent = `${t("autoLocationShort")} · ${place}`;
  }

  const timezoneId = automaticLocation?.timezoneId ?? profile.timezoneId;
  const latitude = automaticLocation?.latitude ?? profile.latitude;
  const longitude = automaticLocation?.longitude ?? profile.longitude;

  elements.factLocale.textContent = profile.locale;
  const offset = utcOffsetMinutes(timezoneId);
  elements.factTimezone.textContent = timezoneId;
  elements.factTimezone.title = offset === null ? timezoneId : `${timezoneId} · ${utcOffsetLabel(offset)}`;
  elements.factCoords.textContent = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  elements.factCoords.classList.add("mono");
  elements.factPlatform.textContent = platformLabel(profile.platform);
}

function platformLabel(platform: string): string {
  if (platform === "MacIntel") {
    return "macOS";
  }
  if (platform.startsWith("Linux")) {
    return "Linux";
  }
  if (platform === "Win32") {
    return "Windows";
  }
  return platform;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function sendMessage<T = unknown>(message: RuntimeRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error ?? "No response from Ghost background"));
        return;
      }
      resolve(response.value as T);
    });
  });
}

function byId<T extends HTMLElement = HTMLElement>(id: string, selector?: string): T {
  const element = selector ? document.querySelector(selector) : document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}
