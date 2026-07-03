import { allProfiles } from "../shared/profiles";
import { localizeDocument, t } from "../shared/i18n";
import { normalizeHostname } from "../shared/site";
import type { GhostSettings, Profile, RuntimeRequest, RuntimeResponse } from "../shared/types";

const elements = {
  buildInfo: byId("buildInfo"),
  advancedEnabled: byId<HTMLInputElement>("advancedEnabled"),
  profiles: byId("profiles"),
  sites: byId("sites"),
  excludeForm: byId<HTMLFormElement>("excludeForm"),
  excludeInput: byId<HTMLInputElement>("excludeInput"),
  exclusions: byId("exclusions"),
  addProfile: byId<HTMLButtonElement>("addProfile"),
  save: byId<HTMLButtonElement>("save"),
  reset: byId<HTMLButtonElement>("reset"),
  status: byId("status"),
  fingerprint: byId<HTMLButtonElement>("fingerprint")
};

let settings: GhostSettings | null = null;

void initialize();

async function initialize(): Promise<void> {
  localizeDocument();
  settings = await sendMessage<GhostSettings>({ type: "options.getState" });
  render();

  elements.save.addEventListener("click", () => void save());
  elements.reset.addEventListener("click", () => void reset());
  elements.addProfile.addEventListener("click", () => {
    if (!settings) {
      return;
    }
    const base = allProfiles(settings.customProfiles)[0];
    settings.customProfiles.push({
      ...base,
      id: `custom-${Date.now().toString(36)}`,
      label: t("profile"),
      languages: [...base.languages]
    });
    renderProfiles();
    renderSites();
  });
  elements.fingerprint.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("fingerprint.html") });
  });
  elements.excludeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!settings) {
      return;
    }
    const domain = normalizeHostname(elements.excludeInput.value);
    if (!domain) {
      return;
    }
    settings.excludedDomains = [...new Set([...settings.excludedDomains, domain])];
    elements.excludeInput.value = "";
    renderExclusions();
  });
  elements.advancedEnabled.addEventListener("change", () => {
    if (settings) {
      settings.advancedEnabled = elements.advancedEnabled.checked;
    }
  });
}

function render(): void {
  if (!settings) {
    return;
  }

  const manifest = chrome.runtime.getManifest();
  const isAdvanced = manifest.permissions?.includes("debugger") ?? false;
  elements.buildInfo.textContent = isAdvanced ? t("buildAdvanced") : t("buildLite");
  elements.advancedEnabled.checked = settings.advancedEnabled;
  elements.advancedEnabled.disabled = !isAdvanced;
  renderProfiles();
  renderSites();
  renderExclusions();
}

function renderProfiles(): void {
  if (!settings) {
    return;
  }
  const profiles = allProfiles(settings.customProfiles);
  elements.profiles.replaceChildren(...profiles.map((profile) => profileCard(profile)));
}

function profileCard(profile: Profile): HTMLElement {
  const card = document.createElement("article");
  card.className = "profile-card";
  card.dataset.profileId = profile.id;
  card.append(
    inputField("ID", "id", profile.id, true),
    inputField("Label", "label", profile.label, true),
    inputField("Locale", "locale", profile.locale, true),
    inputField("Intl locale", "intlLocale", profile.intlLocale, true),
    inputField("Languages", "languages", profile.languages.join(", "), true),
    inputField("Timezone", "timezoneId", profile.timezoneId, true),
    inputField("Latitude", "latitude", String(profile.latitude), true),
    inputField("Longitude", "longitude", String(profile.longitude), true),
    inputField("Accuracy", "accuracy", String(profile.accuracy), true),
    inputField("Accept-Language", "acceptLanguage", profile.acceptLanguage, true),
    inputField("Platform", "platform", profile.platform, true),
    inputField("Hardware threads", "hardwareConcurrency", String(profile.hardwareConcurrency), true),
    inputField("Device memory", "deviceMemory", String(profile.deviceMemory), true),
    inputField("WebGL vendor", "webglVendor", profile.webglVendor, true),
    inputField("WebGL renderer", "webglRenderer", profile.webglRenderer, true)
  );
  return card;
}

function inputField(labelText: string, key: string, value: string, editable: boolean): HTMLLabelElement {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = key === "webglRenderer" ? document.createElement("textarea") : document.createElement("input");
  input.dataset.key = key;
  input.value = value;
  input.disabled = !editable;
  label.append(input);
  return label;
}

function renderSites(): void {
  if (!settings) {
    return;
  }
  const profiles = allProfiles(settings.customProfiles);
  elements.sites.replaceChildren(...Object.entries(settings.siteProfiles).sort().map(([siteKey, profileId]) => {
    const row = document.createElement("tr");
    const site = document.createElement("td");
    site.textContent = siteKey;
    const profileCell = document.createElement("td");
    const select = document.createElement("select");
    select.dataset.siteKey = siteKey;
    select.append(...profiles.map((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = profile.label;
      return option;
    }));
    select.value = profileId;
    select.addEventListener("change", () => {
      if (settings) {
        settings.siteProfiles[siteKey] = select.value;
      }
    });
    profileCell.append(select);
    const action = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = t("remove");
    remove.addEventListener("click", () => {
      if (!settings) {
        return;
      }
      delete settings.siteProfiles[siteKey];
      renderSites();
    });
    action.append(remove);
    row.append(site, profileCell, action);
    return row;
  }));
}

function renderExclusions(): void {
  if (!settings) {
    return;
  }
  elements.exclusions.replaceChildren(...settings.excludedDomains.map((domain) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = domain;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "x";
    remove.addEventListener("click", () => {
      if (!settings) {
        return;
      }
      settings.excludedDomains = settings.excludedDomains.filter((entry) => entry !== domain);
      renderExclusions();
    });
    chip.append(remove);
    return chip;
  }));
}

async function save(): Promise<void> {
  if (!settings) {
    return;
  }
  settings.customProfiles = readProfilesFromDom();
  await sendMessage({ type: "options.saveState", settings });
  elements.status.textContent = t("saved");
  window.setTimeout(() => {
    elements.status.textContent = "";
  }, 2000);
}

async function reset(): Promise<void> {
  settings = await sendMessage<GhostSettings>({ type: "options.resetState" });
  render();
  elements.status.textContent = t("resetDone");
}

function readProfilesFromDom(): Profile[] {
  const cards = [...elements.profiles.querySelectorAll<HTMLElement>(".profile-card")];
  return cards.map((card) => {
    const get = (key: string) => card.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-key="${key}"]`)?.value.trim() ?? "";
    return {
      id: get("id"),
      label: get("label"),
      locale: get("locale"),
      intlLocale: get("intlLocale"),
      languages: get("languages").split(",").map((entry) => entry.trim()).filter(Boolean),
      timezoneId: get("timezoneId"),
      latitude: Number(get("latitude")),
      longitude: Number(get("longitude")),
      accuracy: Number(get("accuracy")),
      acceptLanguage: get("acceptLanguage"),
      platform: get("platform"),
      uaMode: "desktop-chromium",
      hardwareConcurrency: Number(get("hardwareConcurrency")),
      deviceMemory: Number(get("deviceMemory")),
      canvasSeedPolicy: "site",
      webglVendor: get("webglVendor"),
      webglRenderer: get("webglRenderer")
    };
  });
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
