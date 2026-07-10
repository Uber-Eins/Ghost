import { localizeDocument, t } from "../shared/i18n";
import { FINGERPRINT_TEST_URL } from "../shared/fingerprint-test";
import type { PopupState, Profile, RuntimeRequest, RuntimeResponse } from "../shared/types";

const elements = {
  build: byId("build"),
  globalEnabled: byId<HTMLInputElement>("globalEnabled"),
  siteEnabled: byId<HTMLInputElement>("siteEnabled"),
  site: byId("site"),
  profile: byId<HTMLSelectElement>("profile"),
  profileLabel: byId("profileLabel"),
  profileDetails: byId("profileDetails"),
  regenerate: byId<HTMLButtonElement>("regenerate"),
  disableHour: byId<HTMLButtonElement>("disableHour"),
  options: byId<HTMLButtonElement>("options"),
  test: byId<HTMLButtonElement>("test")
};

let currentState: PopupState | null = null;

void initialize().catch(showError);

async function initialize(): Promise<void> {
  localizeDocument();
  currentState = await loadPopupState();
  render();

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
    runMutation({ type: "regenerateSiteProfile", siteKey: currentState.siteKey });
  });
  elements.disableHour.addEventListener("click", () => {
    runMutation({ type: "setTemporaryDisable", durationMs: 60 * 60 * 1000 });
  });
  elements.options.addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.test.addEventListener("click", () => {
    if (window.confirm(t("fingerprintTestExternalConfirm"))) {
      void chrome.tabs.create({ url: FINGERPRINT_TEST_URL });
    }
  });
}

async function refresh(): Promise<void> {
  currentState = await loadPopupState();
  render();
}

function runMutation(message: RuntimeRequest): void {
  void sendMessage(message).then(refresh).catch(showError);
}

function showError(error: unknown): void {
  elements.profileDetails.textContent = error instanceof Error ? error.message : String(error);
}

async function loadPopupState(): Promise<PopupState> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return sendMessage<PopupState>({ type: "getPopupState", url: tab?.url ?? "" });
}

function render(): void {
  if (!currentState) {
    return;
  }

  elements.build.textContent = currentState.earlyBootstrapAvailable
    ? currentState.build
    : `${currentState.build} · ${t("earlyBootstrapUnavailable")}`;
  elements.globalEnabled.checked = currentState.settings.enabled;
  elements.siteEnabled.checked = currentState.enabledForSite;
  elements.site.textContent = currentState.siteKey || "-";
  elements.siteEnabled.disabled = !currentState.supportedPage;
  elements.profile.disabled = !currentState.supportedPage;
  elements.regenerate.disabled = !currentState.supportedPage;
  elements.profile.replaceChildren(...currentState.profiles.map(optionForProfile));
  elements.profile.value = currentState.profile.id;
  renderProfile(currentState.profile);
}

function optionForProfile(profile: Profile): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = profile.id;
  option.textContent = profile.label;
  return option;
}

function renderProfile(profile: Profile): void {
  elements.profileLabel.textContent = profile.label;
  elements.profileDetails.textContent = currentState?.supportedPage
    ? `${profile.locale} | ${profile.timezoneId} | ${profile.latitude.toFixed(3)}, ${profile.longitude.toFixed(3)}`
    : currentState?.fileAccessRequired
      ? t("fileAccessRequired")
      : t("unsupportedPage");
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

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}
