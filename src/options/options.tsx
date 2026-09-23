import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  Asterisk,
  AudioLines,
  Ban,
  Blocks,
  CircleAlert,
  CircleCheck,
  Cpu,
  Fingerprint,
  Globe,
  Hand,
  Info,
  Languages,
  Layers,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Monitor,
  Plus,
  Radar,
  RefreshCw,
  RotateCcw,
  Route,
  Save,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Type,
  Wand2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Section } from "./components/ui/section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { SettingRow } from "./components/ui/setting-row";
import { Switch } from "./components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import { ConfirmDialog } from "./components/confirm-dialog";
import { AddProfileCard, ProfileCard } from "./components/profile-card";
import { normalizeProfileDraft, ProfileEditorDialog, type ProfileDialogState } from "./components/profile-editor";
import { Sidebar, type NavItem } from "./components/sidebar";
import { FINGERPRINT_TEST_URL } from "../shared/fingerprint-test";
import {
  applyHeliumFlagDetection,
  detectHeliumFlags,
  detectedHeliumFlagNames,
  HELIUM_SURFACE_KEYS,
  sameHeliumSurfaces,
  type HeliumFlagDetection
} from "../shared/helium-detect";
import { openUserScriptsSettingsPage, repairContentBootstrap } from "../background/bootstrap";
import { cloneProfile, allProfiles, PRESET_PROFILE_IDS, PRESET_PROFILES } from "../shared/profiles";
import { localizeDocument, t } from "../shared/i18n";
import { DEFAULT_SITE_RULE, normalizeExclusionRule, normalizeSiteRuleKey } from "../shared/site";
import { normalizeSettings, profileIdForSiteKey, SETTINGS_LIMITS, STORAGE_KEY } from "../shared/storage";
import type { GhostSettings, Profile, RuntimeRequest, RuntimeResponse } from "../shared/types";

type SectionId = "general" | "location" | "helium" | "profiles" | "sites" | "exclusions";
type ToastTone = "info" | "success" | "error";
type ToastState = { id: number; message: string; tone: ToastTone };
type ConfirmKind = "reset" | "test";

const root = createRoot(document.getElementById("root") ?? document.body);
root.render(<OptionsApp />);

function OptionsApp(): React.ReactElement {
  const [settings, setSettings] = React.useState<GhostSettings | null>(null);
  const [savedSettings, setSavedSettings] = React.useState<GhostSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [profileDialog, setProfileDialog] = React.useState<ProfileDialogState | null>(null);
  const [confirm, setConfirm] = React.useState<ConfirmKind | null>(null);
  const [siteRuleInput, setSiteRuleInput] = React.useState("");
  const [excludeInput, setExcludeInput] = React.useState("");
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [synchronousProtectionAvailable, setSynchronousProtectionAvailable] = React.useState<boolean | null>(null);
  const [automaticLocationRefreshing, setAutomaticLocationRefreshing] = React.useState(false);
  const [automaticLocationSavedEnabled, setAutomaticLocationSavedEnabled] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<SectionId>("general");
  const [detection, setDetection] = React.useState<HeliumFlagDetection | null>(null);
  const [detecting, setDetecting] = React.useState(false);
  const [platformInfo, setPlatformInfo] = React.useState<chrome.runtime.PlatformInfo | null>(null);
  const toastTimer = React.useRef<number | null>(null);
  const navLock = React.useRef<number | null>(null);

  const isAdvancedBuild = React.useMemo(() => chrome.runtime.getManifest().permissions?.includes("debugger") ?? false, []);
  const version = React.useMemo(() => chrome.runtime.getManifest().version, []);
  const profiles = React.useMemo(
    () => settings ? allProfiles(settings.customProfiles, settings.hiddenPresetProfileIds) : [],
    [settings]
  );
  const dirty = settings !== null && savedSettings !== null && !sameSettings(settings, savedSettings);
  const loaded = settings !== null;

  const navItems = React.useMemo<Array<NavItem & { id: SectionId }>>(() => [
    { id: "general", label: t("navGeneral"), icon: SlidersHorizontal },
    { id: "location", label: t("navLocation"), icon: MapPin },
    { id: "helium", label: t("navHelium"), icon: Blocks },
    { id: "profiles", label: t("profiles"), icon: Layers },
    { id: "sites", label: t("siteRules"), icon: Route },
    { id: "exclusions", label: t("excludedDomains"), icon: Ban }
  ], []);

  React.useEffect(() => {
    localizeDocument();
    document.title = t("ghostOptions");
    try {
      chrome.runtime.getPlatformInfo((info) => setPlatformInfo(info));
    } catch {
      // Platform info is informational only.
    }
  }, []);

  React.useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      const change = changes[STORAGE_KEY];
      if (areaName !== "local" || !change?.newValue) {
        return;
      }
      const stored = normalizeSettings(change.newValue);
      setAutomaticLocationSavedEnabled(stored.automaticLocationEnabled);
      const mergeLocation = (current: GhostSettings | null) => current
        ? normalizeSettings({ ...current, automaticLocation: stored.automaticLocation })
        : stored;
      setSettings(mergeLocation);
      setSavedSettings(mergeLocation);
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  React.useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Scroll spy: the active section is the last one whose top has passed a line
  // 30% down the viewport. At the bottom of the page the final section wins
  // even when it is too short to reach that line. Programmatic navigation
  // locks the highlight until the smooth scroll settles so the tracker cannot
  // briefly flip back to the previous section.
  React.useEffect(() => {
    if (!loaded) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      if (navLock.current !== null) {
        return;
      }
      const root = document.documentElement;
      const atBottom = window.innerHeight + window.scrollY >= root.scrollHeight - 2;
      const lastItem = navItems[navItems.length - 1];
      if (atBottom && lastItem) {
        setActiveSection(lastItem.id);
        return;
      }
      const line = window.innerHeight * 0.3;
      let current = navItems[0]?.id ?? "general";
      for (const item of navItems) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= line) {
          current = item.id;
        }
      }
      setActiveSection(current);
    };
    const schedule = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [loaded, navItems]);

  const flashToast = React.useCallback((message: string, tone: ToastTone = "info") => {
    setToast({ id: Date.now(), message, tone });
    if (toastTimer.current !== null) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const updateSettings = React.useCallback((updater: (current: GhostSettings) => GhostSettings) => {
    setSettings((current) => current ? normalizeSettings(updater(current)) : current);
  }, []);

  const runDetection = React.useCallback(async (): Promise<HeliumFlagDetection | null> => {
    setDetecting(true);
    try {
      const result = await detectHeliumFlags();
      setDetection(result);
      return result;
    } catch {
      return null;
    } finally {
      setDetecting(false);
    }
  }, []);

  // Pushes detected flag effects through the background so open tabs are
  // refreshed, then mirrors the three switches into both the draft and the
  // saved baseline without disturbing other unsaved edits.
  const syncDetectedFlags = React.useCallback(async (result: HeliumFlagDetection) => {
    const synced = normalizeSettings(await sendMessage<GhostSettings>({ type: "syncHeliumFlags", detection: result }));
    const surfaces = Object.fromEntries(HELIUM_SURFACE_KEYS.map((key) => [key, synced[key]]));
    const mergeSurfaces = (current: GhostSettings | null) => current ? normalizeSettings({ ...current, ...surfaces }) : synced;
    setSettings(mergeSurfaces);
    setSavedSettings(mergeSurfaces);
  }, []);

  const redetect = React.useCallback(async () => {
    const result = await runDetection();
    const base = savedSettings;
    if (!result || !base?.heliumFlagSync || sameHeliumSurfaces(base, applyHeliumFlagDetection(base, result))) {
      return;
    }
    try {
      await syncDetectedFlags(result);
      flashToast(t("heliumFlagsUpdated"), "success");
    } catch (error) {
      flashToast(errorText(error), "error");
    }
  }, [flashToast, runDetection, savedSettings, syncDetectedFlags]);

  React.useEffect(() => {
    void sendMessage<GhostSettings>({ type: "options.getState" })
      .then(async (value) => {
        const nextSettings = normalizeSettings(value);
        setSettings(nextSettings);
        setSavedSettings(nextSettings);
        setAutomaticLocationSavedEnabled(nextSettings.automaticLocationEnabled);
        setSynchronousProtectionAvailable(await repairContentBootstrapBestEffort(nextSettings, isAdvancedBuild));
        const result = await runDetection();
        if (result && nextSettings.heliumFlagSync && !sameHeliumSurfaces(nextSettings, applyHeliumFlagDetection(nextSettings, result))) {
          await syncDetectedFlags(result);
          flashToast(t("heliumFlagsUpdated"), "success");
        }
      })
      .catch((error) => {
        setSynchronousProtectionAvailable(false);
        setLoadError(errorText(error));
      });
  }, [flashToast, isAdvancedBuild, runDetection, syncDetectedFlags]);

  const navigate = React.useCallback((id: string) => {
    setActiveSection(id as SectionId);
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    const release = () => {
      if (navLock.current !== null) {
        window.clearTimeout(navLock.current);
        navLock.current = null;
      }
      window.removeEventListener("scrollend", release);
    };
    release();
    navLock.current = window.setTimeout(release, 1200);
    window.addEventListener("scrollend", release, { once: true });
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const openCreateProfile = React.useCallback(() => {
    const base = profiles[0] ?? PRESET_PROFILES[0];
    setProfileDialog({
      mode: "create",
      draft: {
        ...cloneProfile(base),
        id: `custom-${Date.now().toString(36)}`,
        label: t("customProfileDefaultLabel")
      }
    });
  }, [profiles]);

  const openEditProfile = React.useCallback((profile: Profile) => {
    setProfileDialog({ mode: "edit", draft: cloneProfile(profile) });
  }, []);

  const saveProfileDraft = React.useCallback((profile: Profile) => {
    if (settings && !settings.customProfiles.some((entry) => entry.id === profile.id) && settings.customProfiles.length >= SETTINGS_LIMITS.customProfiles) {
      flashToast(t("settingsLimitReached"), "error");
      return;
    }
    updateSettings((current) => {
      const customProfiles = current.customProfiles.filter((entry) => entry.id !== profile.id);
      return {
        ...current,
        customProfiles: [...customProfiles, normalizeProfileDraft(profile)],
        hiddenPresetProfileIds: current.hiddenPresetProfileIds.filter((id) => id !== profile.id)
      };
    });
    setProfileDialog(null);
    flashToast(t("profileSaved"), "success");
  }, [flashToast, settings, updateSettings]);

  const deleteProfile = React.useCallback((profile: Profile) => {
    if (profiles.length <= 1) {
      flashToast(t("cannotDeleteLastProfile"), "error");
      return;
    }
    updateSettings((current) => {
      const hiddenPresetProfileIds = PRESET_PROFILE_IDS.has(profile.id)
        ? [...new Set([...current.hiddenPresetProfileIds, profile.id])]
        : current.hiddenPresetProfileIds;
      return {
        ...current,
        customProfiles: current.customProfiles.filter((entry) => entry.id !== profile.id),
        hiddenPresetProfileIds
      };
    });
    flashToast(t("profileDeleted"));
  }, [flashToast, profiles.length, updateSettings]);

  const save = React.useCallback(async () => {
    if (!settings || saving) {
      return;
    }
    setSaving(true);
    try {
      const saved = await sendMessage<GhostSettings>({ type: "options.saveState", settings: normalizeSettings(settings) });
      const normalized = normalizeSettings(saved);
      setSettings(normalized);
      setSavedSettings(normalized);
      setAutomaticLocationSavedEnabled(normalized.automaticLocationEnabled);
      setSynchronousProtectionAvailable(await repairContentBootstrapBestEffort(normalized, isAdvancedBuild));
      flashToast(t("saved"), "success");
    } catch (error) {
      flashToast(errorText(error), "error");
    } finally {
      setSaving(false);
    }
  }, [flashToast, isAdvancedBuild, saving, settings]);

  const discard = React.useCallback(() => {
    if (savedSettings) {
      setSettings(savedSettings);
    }
  }, [savedSettings]);

  const reset = React.useCallback(async () => {
    try {
      const resetSettings = await sendMessage<GhostSettings>({ type: "options.resetState" });
      const normalized = normalizeSettings(resetSettings);
      setSettings(normalized);
      setSavedSettings(normalized);
      setAutomaticLocationSavedEnabled(normalized.automaticLocationEnabled);
      setSynchronousProtectionAvailable(await repairContentBootstrapBestEffort(normalized, isAdvancedBuild));
      flashToast(t("resetDone"), "success");
    } catch (error) {
      flashToast(errorText(error), "error");
    }
  }, [flashToast, isAdvancedBuild]);

  const refreshAutomaticLocation = React.useCallback(async () => {
    if (!settings?.automaticLocationEnabled || !automaticLocationSavedEnabled || automaticLocationRefreshing) {
      return;
    }
    setAutomaticLocationRefreshing(true);
    try {
      const refreshed = normalizeSettings(await sendMessage<GhostSettings>({
        type: "options.refreshAutomaticLocation"
      }));
      const mergeLocation = (current: GhostSettings | null) => current
        ? normalizeSettings({ ...current, automaticLocation: refreshed.automaticLocation })
        : refreshed;
      setSettings(mergeLocation);
      setSavedSettings(mergeLocation);
      flashToast(t("automaticLocationRefreshDone"), "success");
    } catch (error) {
      flashToast(errorText(error), "error");
    } finally {
      setAutomaticLocationRefreshing(false);
    }
  }, [automaticLocationRefreshing, automaticLocationSavedEnabled, flashToast, settings?.automaticLocationEnabled]);

  const addExclusion = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const domain = normalizeExclusionRule(excludeInput);
    if (!domain) {
      flashToast(t("invalidExclusionRule"), "error");
      return;
    }
    if (!settings?.excludedDomains.includes(domain) && (settings?.excludedDomains.length ?? 0) >= SETTINGS_LIMITS.exclusionRules) {
      flashToast(t("settingsLimitReached"), "error");
      return;
    }
    updateSettings((current) => ({
      ...current,
      excludedDomains: [...new Set([...current.excludedDomains, domain])]
    }));
    setExcludeInput("");
  }, [excludeInput, flashToast, settings, updateSettings]);

  const addSiteRule = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const siteRule = normalizeSiteRuleKey(siteRuleInput);
    if (!siteRule) {
      flashToast(t("invalidSiteRule"), "error");
      return;
    }
    if (!settings?.siteProfiles[siteRule] && Object.keys(settings?.siteProfiles ?? {}).length >= SETTINGS_LIMITS.siteProfileRules) {
      flashToast(t("settingsLimitReached"), "error");
      return;
    }
    updateSettings((current) => {
      const inheritedProfileId = profileIdForSiteKey(siteRule, current);
      return {
        ...current,
        siteProfiles: {
          ...current.siteProfiles,
          [siteRule]: current.siteProfiles[siteRule] ?? inheritedProfileId
        }
      };
    });
    setSiteRuleInput("");
  }, [flashToast, settings, siteRuleInput, updateSettings]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) {
          void save();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, save]);

  if (!settings) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="panel flex items-center gap-3 px-6 py-5 text-sm text-muted-foreground" role="status" aria-live="polite">
          {loadError ? (
            <>
              <CircleAlert className="h-4 w-4 text-destructive" />
              {loadError}
            </>
          ) : (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin text-primary" />
              {t("loadingSettings")}
            </>
          )}
        </div>
      </div>
    );
  }

  const siteRules = sortedSiteProfiles(settings.siteProfiles);
  const profileUsage = countProfileUsage(settings.siteProfiles);
  const buildLabel = isAdvancedBuild ? t("buildAdvancedLabel") : t("buildLiteLabel");
  const detectedLocation = settings.automaticLocationEnabled ? settings.automaticLocation : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app">
        <Sidebar
          items={navItems}
          activeId={activeSection}
          isAdvancedBuild={isAdvancedBuild}
          version={version}
          protectionAvailable={synchronousProtectionAvailable}
          onNavigate={navigate}
        />

        <main className="content">
          <header className="mb-10 flex flex-col gap-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <div className="eyebrow mb-2">Ghost · {buildLabel}</div>
                <h1>{t("ghostOptions")}</h1>
                <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">{t("optionsSubtitle")}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" onClick={() => setConfirm("test")}>
                  <Fingerprint className="h-4 w-4" />
                  {t("fingerprintTestExternal")}
                </Button>
                <Button variant="ghost" onClick={() => setConfirm("reset")}>
                  <RotateCcw className="h-4 w-4" />
                  {t("reset")}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatChip icon={Layers} count={profiles.length} label={t("profileCount")} onClick={() => navigate("profiles")} />
              <StatChip icon={Route} count={siteRules.length} label={t("ruleCount")} onClick={() => navigate("sites")} />
              <StatChip icon={Ban} count={settings.excludedDomains.length} label={t("exclusionCount")} onClick={() => navigate("exclusions")} />
            </div>
          </header>

          {synchronousProtectionAvailable === false ? (
            <section className="panel mb-10 flex flex-col gap-4 border-destructive/40 p-5 sm:flex-row sm:items-center sm:justify-between" role="alert">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/12 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold text-destructive">{t("unprotected")}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t("enableUserScriptsRequired")}</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => void openUserScriptsSettingsPage().catch((error) => flashToast(errorText(error), "error"))}>
                {t("openExtensionSettings")}
              </Button>
            </section>
          ) : null}

          <div className="flex flex-col gap-14">
            <Section id="general" icon={SlidersHorizontal} title={t("globalConfig")} description={t("globalConfigSubtitle")}>
              <div className="panel divide-y divide-border/70">
                <SettingRow icon={ShieldCheck} title={t("globalProtection")} description={t("globalProtectionSubtitle")}>
                  <Switch
                    checked={settings.enabled}
                    onCheckedChange={(checked) => updateSettings((current) => ({ ...current, enabled: checked }))}
                    aria-label={t("globalProtection")}
                  />
                </SettingRow>
                <SettingRow icon={Hand} title={t("globalPrivacyControl")} description={t("globalPrivacyControlSubtitle")}>
                  <Switch
                    checked={settings.globalPrivacyControlEnabled}
                    onCheckedChange={(checked) => updateSettings((current) => ({
                      ...current,
                      globalPrivacyControlEnabled: checked
                    }))}
                    aria-label={t("globalPrivacyControl")}
                  />
                </SettingRow>
                <SettingRow
                  icon={Terminal}
                  disabled={!isAdvancedBuild}
                  title={(
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {t("advancedOverrides")}
                      <Badge variant={isAdvancedBuild ? "success" : "outline"}>{buildLabel}</Badge>
                    </span>
                  )}
                  description={isAdvancedBuild ? t("buildAdvanced") : `${t("advancedUnavailable")} ${t("buildLite")}`}
                >
                  <Switch
                    checked={settings.advancedEnabled}
                    disabled={!isAdvancedBuild}
                    onCheckedChange={(checked) => updateSettings((current) => ({ ...current, advancedEnabled: checked }))}
                    aria-label={t("advancedToggle")}
                  />
                </SettingRow>
              </div>
            </Section>

            <Section id="location" icon={MapPin} title={t("automaticLocation")} description={t("automaticLocationSubtitle")}>
              <div className="panel divide-y divide-border/70">
                <SettingRow icon={Radar} title={t("automaticLocationEnabled")} description={t("automaticLocationEnabledSubtitle")}>
                  <Switch
                    checked={settings.automaticLocationEnabled}
                    onCheckedChange={(checked) => updateSettings((current) => ({
                      ...current,
                      automaticLocationEnabled: checked
                    }))}
                    aria-label={t("automaticLocationEnabled")}
                  />
                </SettingRow>
                <SettingRow
                  icon={Languages}
                  title={t("automaticLanguage")}
                  description={t("automaticLanguageSubtitle")}
                  disabled={!settings.automaticLocationEnabled}
                >
                  <Select
                    disabled={!settings.automaticLocationEnabled}
                    value={settings.automaticLanguageMode}
                    onValueChange={(value) => updateSettings((current) => ({
                      ...current,
                      automaticLanguageMode: value === "auto" ? "auto" : "profile"
                    }))}
                  >
                    <SelectTrigger className="w-56" aria-label={t("automaticLanguage")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="profile">{t("automaticLanguageProfile")}</SelectItem>
                      <SelectItem value="auto">{t("automaticLanguageAuto")}</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
                <div className="px-5 py-4">
                  <div className="panel-inset p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <LocateFixed className="h-4 w-4 text-primary" />
                        {t("automaticLocationStatus")}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !settings.automaticLocationEnabled
                          || !automaticLocationSavedEnabled
                          || automaticLocationRefreshing
                        }
                        onClick={() => void refreshAutomaticLocation()}
                        aria-label={t("automaticLocationRefresh")}
                        aria-busy={automaticLocationRefreshing}
                      >
                        <RefreshCw className={`h-3.5 w-3.5${automaticLocationRefreshing ? " animate-spin" : ""}`} />
                        {automaticLocationRefreshing ? t("automaticLocationRefreshing") : t("refresh")}
                      </Button>
                    </div>
                    {detectedLocation ? (
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
                        <Fact label={t("location")}>
                          {[detectedLocation.city, detectedLocation.region, detectedLocation.country].filter(Boolean).join(", ") || detectedLocation.countryCode}
                        </Fact>
                        <Fact label={t("timezone")}>{detectedLocation.timezoneId}</Fact>
                        <Fact label={t("coordinates")}>
                          <span className="font-mono text-xs">{detectedLocation.latitude.toFixed(3)}, {detectedLocation.longitude.toFixed(3)}</span>
                        </Fact>
                        <Fact label={t("automaticLocationUpdated")}>{new Date(detectedLocation.updatedAt).toLocaleString()}</Fact>
                      </dl>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {settings.automaticLocationEnabled ? t("automaticLocationPending") : t("automaticLocationDisabled")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            <Section id="helium" icon={Blocks} title={t("heliumCompatibility")} description={t("heliumCompatibilitySubtitle")}>
              <div className="panel mb-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ScanSearch className="h-4 w-4 text-primary" />
                      {t("browserEnvironment")}
                    </div>
                    <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{t("browserEnvironmentSubtitle")}</p>
                  </div>
                  <Button variant="outline" size="sm" disabled={detecting} onClick={() => void redetect()} aria-busy={detecting}>
                    <RefreshCw className={`h-3.5 w-3.5${detecting ? " animate-spin" : ""}`} />
                    {detecting ? t("detecting") : t("redetect")}
                  </Button>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 text-sm md:grid-cols-3">
                  <Fact label={t("browser")}>
                    {detection?.chromiumMajor ? `Chromium ${detection.chromiumMajor}` : "—"}
                    {detection && detection.brands.length > 0 ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        {detection.brands.filter((entry) => !/not.*brand/i.test(entry.brand)).map((entry) => entry.brand).join(", ")}
                      </span>
                    ) : null}
                  </Fact>
                  <Fact label={t("system")}>{platformInfo ? `${osLabel(platformInfo.os)} · ${platformInfo.arch}` : "—"}</Fact>
                  <Fact label={t("cpuCores")}>{detection?.hardwareConcurrency ?? "—"}</Fact>
                  <Fact label="WebGL" className="col-span-2 md:col-span-2">
                    <span className="inline-flex max-w-full items-center gap-2">
                      <span className="truncate font-mono text-xs" title={detection ? `${detection.webglVendor ?? ""}\n${detection.webglRenderer ?? ""}` : undefined}>
                        {detection ? (detection.webglRenderer?.trim() || t("unavailable")) : "—"}
                      </span>
                      {detection?.webglSpoofed ? <Badge variant="success">{t("spoofed")}</Badge> : null}
                    </span>
                  </Fact>
                  <Fact label={t("clientHints")}>
                    <ClientHintsValue detection={detection} />
                  </Fact>
                  <Fact label={t("measureTextProbe")}>
                    {detection ? <DetectionBadge value={detection.measureTextNoise} /> : "—"}
                  </Fact>
                </dl>
                <div className="mt-4 border-t border-border/70 pt-3 text-sm">
                  {!detection ? (
                    <p className="text-muted-foreground">{detecting ? t("detecting") : t("notProbedYet")}</p>
                  ) : detectedHeliumFlagNames(detection).length === 0 ? (
                    <p className="text-muted-foreground">{t("heliumFlagsSummaryNone")}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t("heliumFlagsSummarySome")}</span>
                      {detectedHeliumFlagNames(detection).map((name) => (
                        <code key={name} className="chip">#{name}</code>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="panel divide-y divide-border/70">
                <SettingRow icon={Wand2} title={t("heliumFlagSync")} description={t("heliumFlagSyncSubtitle")}>
                  <Switch
                    checked={settings.heliumFlagSync}
                    onCheckedChange={(checked) => updateSettings((current) => {
                      const next = { ...current, heliumFlagSync: checked };
                      return checked && detection ? applyHeliumFlagDetection(next, detection) : next;
                    })}
                    aria-label={t("heliumFlagSync")}
                  />
                </SettingRow>
                <SettingRow icon={AudioLines} title={t("heliumManagedAudioHardware")} description={t("heliumManagedAudioHardwareSubtitle")}>
                  <Badge variant="secondary" className="hidden sm:inline-flex">{t("heliumOwned")}</Badge>
                </SettingRow>
                <SettingRow
                  icon={Type}
                  title={t("useHeliumCanvasMeasureText")}
                  description={`${t("useHeliumCanvasMeasureTextSubtitle")} ${t("measureTextNoiseHint")}`}
                >
                  <DetectionBadge value={detection?.measureTextNoise} auto={settings.heliumFlagSync} />
                  <Switch
                    checked={settings.disableCanvasMeasureTextSpoofing}
                    disabled={settings.heliumFlagSync}
                    onCheckedChange={(checked) => updateSettings((current) => ({
                      ...current,
                      disableCanvasMeasureTextSpoofing: checked
                    }))}
                    aria-label={t("useHeliumCanvasMeasureText")}
                  />
                </SettingRow>
                <SettingRow icon={Cpu} title={t("useHeliumWebglInfo")} description={t("useHeliumWebglInfoSubtitle")}>
                  <DetectionBadge value={detection?.webglSpoofed} auto={settings.heliumFlagSync} />
                  <Switch
                    checked={settings.disableWebglInfoSpoofing}
                    disabled={settings.heliumFlagSync}
                    onCheckedChange={(checked) => updateSettings((current) => ({
                      ...current,
                      disableWebglInfoSpoofing: checked
                    }))}
                    aria-label={t("useHeliumWebglInfo")}
                  />
                </SettingRow>
                <SettingRow icon={Monitor} title={t("useHeliumUaReduction")} description={t("useHeliumUaReductionSubtitle")}>
                  <DetectionBadge value={detection?.uaReductionActive} auto={settings.heliumFlagSync} />
                  <Switch
                    checked={settings.disableUserAgentSpoofing}
                    disabled={settings.heliumFlagSync}
                    onCheckedChange={(checked) => updateSettings((current) => ({ ...current, disableUserAgentSpoofing: checked }))}
                    aria-label={t("useHeliumUaReduction")}
                  />
                </SettingRow>
              </div>
            </Section>

            <Section
              id="profiles"
              icon={Layers}
              title={t("profiles")}
              description={t("profilesSubtitle")}
              actions={(
                <Button onClick={openCreateProfile}>
                  <Plus className="h-4 w-4" />
                  {t("addProfile")}
                </Button>
              )}
            >
              <div className="grid gap-4 md:grid-cols-2">
                {profiles.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    isPreset={PRESET_PROFILE_IDS.has(profile.id) && !settings.customProfiles.some((entry) => entry.id === profile.id)}
                    usedByRules={profileUsage.get(profile.id) ?? 0}
                    canDelete={profiles.length > 1}
                    hideUserAgentFields={settings.disableUserAgentSpoofing}
                    hideWebglFields={settings.disableWebglInfoSpoofing}
                    onEdit={() => openEditProfile(profile)}
                    onDelete={() => deleteProfile(profile)}
                  />
                ))}
                <AddProfileCard onClick={openCreateProfile} />
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                {t("seedNote")}
              </p>
            </Section>

            <Section id="sites" icon={Route} title={t("siteRules")} description={t("siteRulesSubtitle")}>
              <div className="panel overflow-hidden">
                <form className="flex flex-col gap-2 border-b border-border/70 p-4 sm:flex-row" onSubmit={addSiteRule}>
                  <div className="relative flex-1">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9 font-mono"
                      value={siteRuleInput}
                      onChange={(event) => setSiteRuleInput(event.target.value)}
                      placeholder={t("siteRulePlaceholder")}
                      aria-label={t("siteRuleInputLabel")}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button type="submit" variant="secondary" aria-label={t("addSiteRule")}>
                    <Plus className="h-4 w-4" />
                    {t("addSiteRule")}
                  </Button>
                </form>
                <ul className="divide-y divide-border/70">
                  {siteRules.map(([siteKey, profileId]) => {
                    const isDefault = siteKey === DEFAULT_SITE_RULE;
                    return (
                      <li key={siteKey} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="icon-tile h-8 w-8 rounded-lg">
                            {isDefault ? <Asterisk className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                          </span>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate font-mono text-sm font-medium">{siteKey}</span>
                            {isDefault ? <Badge variant="soft">{t("defaultRule")}</Badge> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Select
                            value={profileId}
                            onValueChange={(value) => updateSettings((current) => ({
                              ...current,
                              siteProfiles: { ...current.siteProfiles, [siteKey]: value }
                            }))}
                          >
                            <SelectTrigger className="h-9 w-full sm:w-60" aria-label={`${t("profile")}: ${siteKey}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {profiles.map((profile) => (
                                <SelectItem key={profile.id} value={profile.id}>{profile.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="hover:bg-destructive/10 hover:text-destructive"
                                disabled={isDefault}
                                aria-label={`${t("remove")} ${siteKey}`}
                                onClick={() => updateSettings((current) => {
                                  const siteProfiles = { ...current.siteProfiles };
                                  delete siteProfiles[siteKey];
                                  return { ...current, siteProfiles };
                                })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("remove")}</TooltipContent>
                          </Tooltip>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {siteRules.length <= 1 ? (
                  <EmptyState icon={Route} title={t("noSiteRules")} hint={t("siteRuleEmptyHint")} />
                ) : null}
              </div>
            </Section>

            <Section id="exclusions" icon={Ban} title={t("excludedDomains")} description={t("excludedDomainsSubtitle")}>
              <div className="panel overflow-hidden">
                <form className="flex flex-col gap-2 border-b border-border/70 p-4 sm:flex-row" onSubmit={addExclusion}>
                  <div className="relative flex-1">
                    <Ban className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9 font-mono"
                      value={excludeInput}
                      onChange={(event) => setExcludeInput(event.target.value)}
                      placeholder="example.com/login"
                      aria-label={t("exclusionRuleInputLabel")}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <Button type="submit" variant="secondary" aria-label={t("addExclusion")}>
                    <Plus className="h-4 w-4" />
                    {t("addExclusion")}
                  </Button>
                </form>
                {settings.excludedDomains.length === 0 ? (
                  <EmptyState icon={Ban} title={t("noExcludedDomains")} hint={t("exclusionEmptyHint")} />
                ) : (
                  <div className="flex flex-wrap gap-2 p-4">
                    {settings.excludedDomains.map((domain) => (
                      <span key={domain} className="chip">
                        {domain}
                        <button
                          type="button"
                          onClick={() => updateSettings((current) => ({
                            ...current,
                            excludedDomains: current.excludedDomains.filter((entry) => entry !== domain)
                          }))}
                          aria-label={`${t("remove")} ${domain}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          </div>
        </main>

        <div className="save-bar" data-visible={dirty || saving} aria-hidden={!dirty && !saving}>
          <span className="flex items-center gap-2 text-sm font-medium">
            <span className={`h-2 w-2 rounded-full ${saving ? "bg-primary animate-pulse" : "bg-warning"}`} />
            {saving ? t("saving") : t("unsavedChanges")}
          </span>
          <Button variant="ghost" size="sm" onClick={discard} disabled={saving || !dirty}>{t("discard")}</Button>
          <Button size="sm" className="rounded-full px-4" onClick={() => void save()} disabled={saving || !dirty}>
            <Save className="h-3.5 w-3.5" />
            {t("saveChanges")}
          </Button>
        </div>

        {toast ? (
          <div key={toast.id} className="toast" data-tone={toast.tone} role="status" aria-live="polite">
            {toast.tone === "success" ? <CircleCheck className="h-4 w-4 text-success" /> : null}
            {toast.tone === "error" ? <CircleAlert className="h-4 w-4 text-destructive" /> : null}
            {toast.tone === "info" ? <Info className="h-4 w-4 text-primary" /> : null}
            <span>{toast.message}</span>
          </div>
        ) : null}

        <ConfirmDialog
          open={confirm === "reset"}
          onOpenChange={(open) => setConfirm(open ? "reset" : null)}
          icon={RotateCcw}
          title={t("confirmResetTitle")}
          description={t("confirmResetDescription")}
          confirmLabel={t("reset")}
          destructive
          onConfirm={() => void reset()}
        />
        <ConfirmDialog
          open={confirm === "test"}
          onOpenChange={(open) => setConfirm(open ? "test" : null)}
          icon={Fingerprint}
          title={t("externalTestTitle")}
          description={t("fingerprintTestExternalConfirm")}
          confirmLabel={t("confirmContinue")}
          onConfirm={() => void chrome.tabs.create({ url: FINGERPRINT_TEST_URL })}
        />

        <Dialog open={profileDialog !== null} onOpenChange={(open) => !open && setProfileDialog(null)}>
          {profileDialog ? (
            <ProfileEditorDialog
              state={profileDialog}
              hideUserAgentFields={settings.disableUserAgentSpoofing}
              hideWebglFields={settings.disableWebglInfoSpoofing}
              onDraftChange={(draft) => setProfileDialog((current) => current ? { ...current, draft } : current)}
              onCancel={() => setProfileDialog(null)}
              onSave={saveProfileDraft}
            />
          ) : null}
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function StatChip({
  icon: Icon,
  count,
  label,
  onClick
}: {
  icon: LucideIcon;
  count: number;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button type="button" className="stat-chip" onClick={onClick}>
      <Icon className="h-3.5 w-3.5" />
      <strong>{count}</strong>
      {label}
    </button>
  );
}

function DetectionBadge({ value, auto }: { value: boolean | null | undefined; auto?: boolean }): React.ReactElement | null {
  if (value === undefined) {
    return null;
  }
  const label = value === null ? t("unavailable") : value ? t("detected") : t("notDetected");
  return (
    <Badge variant={value ? "success" : "outline"} className="hidden sm:inline-flex">
      {auto ? `${t("autoManaged")} · ${label}` : label}
    </Badge>
  );
}

function ClientHintsValue({ detection }: { detection: HeliumFlagDetection | null }): React.ReactElement {
  if (!detection) {
    return <>—</>;
  }
  if (detection.clientHintsRemoved === null) {
    return <>{t("unavailable")}</>;
  }
  if (detection.clientHintsRemoved) {
    return <Badge variant="success">{t("clientHintsRemoved")}</Badge>;
  }
  if (detection.systemInfoReduced) {
    return <Badge variant="success">{t("clientHintsLowEntropy")}</Badge>;
  }
  return <>{t("clientHintsFull")}</>;
}

function osLabel(os: string): string {
  switch (os) {
    case "mac":
      return "macOS";
    case "win":
      return "Windows";
    case "linux":
      return "Linux";
    case "cros":
      return "ChromeOS";
    case "android":
      return "Android";
    default:
      return os;
  }
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={`min-w-0${className ? ` ${className}` : ""}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <div className="text-sm font-semibold">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function sameSettings(left: GhostSettings, right: GhostSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function countProfileUsage(siteProfiles: Record<string, string>): Map<string, number> {
  const usage = new Map<string, number>();
  for (const profileId of Object.values(siteProfiles)) {
    usage.set(profileId, (usage.get(profileId) ?? 0) + 1);
  }
  return usage;
}

function sortedSiteProfiles(siteProfiles: Record<string, string>): Array<[string, string]> {
  return Object.entries(siteProfiles).sort(([left], [right]) => {
    if (left === DEFAULT_SITE_RULE) {
      return -1;
    }
    if (right === DEFAULT_SITE_RULE) {
      return 1;
    }
    return left.localeCompare(right);
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function repairContentBootstrapBestEffort(settings: GhostSettings, advanced: boolean): Promise<boolean> {
  try {
    return await repairContentBootstrap(settings, advanced ? "advanced" : "lite");
  } catch {
    return false;
  }
}
