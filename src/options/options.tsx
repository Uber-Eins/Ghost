import * as React from "react";
import { createRoot } from "react-dom/client";
import { Activity, Edit3, Fingerprint, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./components/ui/select";
import { Switch } from "./components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Textarea } from "./components/ui/textarea";
import {
  ARCHITECTURE_OPTIONS,
  applyLocalePreset,
  LOCALE_PRESETS,
  normalizeTimezoneId,
  PLATFORM_OPTIONS,
  timezoneLabel,
  timezoneRegion,
  timezoneRegions,
  timezonesForRegion
} from "../shared/locations";
import { FINGERPRINT_TEST_URL } from "../shared/fingerprint-test";
import { cloneProfile, allProfiles, PRESET_PROFILE_IDS, PRESET_PROFILES } from "../shared/profiles";
import { localizeDocument, t } from "../shared/i18n";
import { DEFAULT_SITE_RULE, normalizeExclusionRule, normalizeSiteRuleKey } from "../shared/site";
import { normalizeSettings, profileIdForSiteKey, SETTINGS_LIMITS } from "../shared/storage";
import type { GhostSettings, Profile, RuntimeRequest, RuntimeResponse } from "../shared/types";

type ProfileDialogState = {
  mode: "create" | "edit";
  draft: Profile;
};

type NumberFieldKey = keyof Pick<Profile, "latitude" | "longitude" | "accuracy" | "hardwareConcurrency" | "deviceMemory">;
type NumberFieldText = Record<NumberFieldKey, string>;

const root = createRoot(document.getElementById("root") ?? document.body);
root.render(<OptionsApp />);

function OptionsApp(): React.ReactElement {
  const [settings, setSettings] = React.useState<GhostSettings | null>(null);
  const [profileDialog, setProfileDialog] = React.useState<ProfileDialogState | null>(null);
  const [siteRuleInput, setSiteRuleInput] = React.useState("");
  const [excludeInput, setExcludeInput] = React.useState("");
  const [status, setStatus] = React.useState("");
  const statusTimer = React.useRef<number | null>(null);

  const isAdvancedBuild = React.useMemo(() => chrome.runtime.getManifest().permissions?.includes("debugger") ?? false, []);
  const profiles = React.useMemo(
    () => settings ? allProfiles(settings.customProfiles, settings.hiddenPresetProfileIds) : [],
    [settings]
  );

  React.useEffect(() => {
    localizeDocument();
    document.title = t("ghostOptions");
    void sendMessage<GhostSettings>({ type: "options.getState" })
      .then((value) => setSettings(normalizeSettings(value)))
      .catch((error) => setStatus(errorText(error)));
  }, []);

  const flashStatus = React.useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current !== null) {
      window.clearTimeout(statusTimer.current);
    }
    statusTimer.current = window.setTimeout(() => setStatus(""), 2200);
  }, []);

  const updateSettings = React.useCallback((updater: (current: GhostSettings) => GhostSettings) => {
    setSettings((current) => current ? normalizeSettings(updater(current)) : current);
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
      flashStatus(t("settingsLimitReached"));
      return;
    }
    updateSettings((current) => {
      const customProfiles = current.customProfiles.filter((entry) => entry.id !== profile.id);
      return {
        ...current,
        customProfiles: [...customProfiles, normalizeProfile(profile)],
        hiddenPresetProfileIds: current.hiddenPresetProfileIds.filter((id) => id !== profile.id)
      };
    });
    setProfileDialog(null);
    flashStatus(t("profileSaved"));
  }, [flashStatus, settings, updateSettings]);

  const deleteProfile = React.useCallback((profile: Profile) => {
    if (profiles.length <= 1) {
      flashStatus(t("cannotDeleteLastProfile"));
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
    flashStatus(t("profileDeleted"));
  }, [flashStatus, profiles.length, updateSettings]);

  const save = React.useCallback(async () => {
    if (!settings) {
      return;
    }
    try {
      const saved = await sendMessage<GhostSettings>({ type: "options.saveState", settings: normalizeSettings(settings) });
      setSettings(normalizeSettings(saved));
      flashStatus(t("saved"));
    } catch (error) {
      flashStatus(errorText(error));
    }
  }, [flashStatus, settings]);

  const reset = React.useCallback(async () => {
    try {
      const resetSettings = await sendMessage<GhostSettings>({ type: "options.resetState" });
      setSettings(normalizeSettings(resetSettings));
      flashStatus(t("resetDone"));
    } catch (error) {
      flashStatus(errorText(error));
    }
  }, [flashStatus]);

  const addExclusion = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const domain = normalizeExclusionRule(excludeInput);
    if (!domain) {
      flashStatus(t("invalidExclusionRule"));
      return;
    }
    if (!settings?.excludedDomains.includes(domain) && (settings?.excludedDomains.length ?? 0) >= SETTINGS_LIMITS.exclusionRules) {
      flashStatus(t("settingsLimitReached"));
      return;
    }
    updateSettings((current) => ({
      ...current,
      excludedDomains: [...new Set([...current.excludedDomains, domain])]
    }));
    setExcludeInput("");
  }, [excludeInput, flashStatus, settings, updateSettings]);

  const addSiteRule = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const siteRule = normalizeSiteRuleKey(siteRuleInput);
    if (!siteRule) {
      flashStatus(t("invalidSiteRule"));
      return;
    }
    if (!settings?.siteProfiles[siteRule] && Object.keys(settings?.siteProfiles ?? {}).length >= SETTINGS_LIMITS.siteProfileRules) {
      flashStatus(t("settingsLimitReached"));
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
  }, [flashStatus, settings, siteRuleInput, updateSettings]);

  if (!settings) {
    return (
      <main className="shell">
        <div className="glass-panel p-8 text-sm text-muted-foreground" role="status" aria-live="polite">
          {status || t("options")}
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="hero-glass">
        <div className="min-w-0">
          <div className="eyebrow">Ghost</div>
          <h1>{t("ghostOptions")}</h1>
          <p>{t("optionsSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (window.confirm(t("fingerprintTestExternalConfirm"))) {
                void chrome.tabs.create({ url: FINGERPRINT_TEST_URL });
              }
            }}
          >
            <Fingerprint className="h-4 w-4" />
            {t("fingerprintTestExternal")}
          </Button>
          <Button variant="outline" onClick={() => void reset()}>
            <RotateCcw className="h-4 w-4" />
            {t("reset")}
          </Button>
        </div>
      </header>

      <section className="glass-panel">
        <SectionTitle title={t("globalConfig")} description={t("globalConfigSubtitle")} />
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="rounded-lg border border-border/70 bg-background/45 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              {t("globalProtection")}
            </div>
            <p className="text-sm text-muted-foreground">{t("globalProtectionSubtitle")}</p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSettings((current) => ({ ...current, enabled: checked }))}
            aria-label={t("globalProtection")}
          />
          <div className="rounded-lg border border-border/70 bg-background/45 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              {isAdvancedBuild ? t("buildAdvanced") : t("buildLite")}
            </div>
            <p className="text-sm text-muted-foreground">{t("advancedToggle")}</p>
          </div>
          <Switch
            checked={settings.advancedEnabled}
            disabled={!isAdvancedBuild}
            onCheckedChange={(checked) => updateSettings((current) => ({ ...current, advancedEnabled: checked }))}
            aria-label={t("advancedToggle")}
          />
          <div className="rounded-lg border border-border/70 bg-background/45 p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              {t("disableUserAgentSpoofing")}
            </div>
            <p className="text-sm text-muted-foreground">{t("disableUserAgentSpoofingSubtitle")}</p>
          </div>
          <Switch
            checked={settings.disableUserAgentSpoofing}
            onCheckedChange={(checked) => updateSettings((current) => ({ ...current, disableUserAgentSpoofing: checked }))}
            aria-label={t("disableUserAgentSpoofing")}
          />
        </div>
      </section>

      <section className="glass-panel">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionTitle title={t("profiles")} description={t("profilesSubtitle")} />
          <Button onClick={openCreateProfile}>
            <Plus className="h-4 w-4" />
            {t("addProfile")}
          </Button>
        </div>
        <ProfilesTable
          profiles={profiles}
          hideUserAgentFields={settings.disableUserAgentSpoofing}
          onEdit={openEditProfile}
          onDelete={deleteProfile}
        />
      </section>

      <section className="glass-panel">
        <SectionTitle title={t("siteRules")} description={t("siteRulesSubtitle")} />
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={addSiteRule}>
          <Input
            value={siteRuleInput}
            onChange={(event) => setSiteRuleInput(event.target.value)}
            placeholder={t("siteRulePlaceholder")}
            aria-label={t("siteRuleInputLabel")}
          />
          <Button type="submit" aria-label={t("addSiteRule")}>{t("addSiteRule")}</Button>
        </form>
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>{t("site")}</TableHead>
              <TableHead>{t("profile")}</TableHead>
              <TableHead className="w-24 text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSiteProfiles(settings.siteProfiles).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">{t("noSiteRules")}</TableCell>
              </TableRow>
            ) : sortedSiteProfiles(settings.siteProfiles).map(([siteKey, profileId]) => (
              <TableRow key={siteKey}>
                <TableCell className="font-medium">{siteKey}</TableCell>
                <TableCell>
                  <Select
                    value={profileId}
                    onValueChange={(value) => updateSettings((current) => ({
                      ...current,
                      siteProfiles: { ...current.siteProfiles, [siteKey]: value }
                    }))}
                  >
                    <SelectTrigger className="max-w-xs" aria-label={`${t("profile")}: ${siteKey}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>{profile.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={siteKey === DEFAULT_SITE_RULE}
                    onClick={() => updateSettings((current) => {
                      const siteProfiles = { ...current.siteProfiles };
                      delete siteProfiles[siteKey];
                      return { ...current, siteProfiles };
                    })}
                  >
                    {t("remove")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="glass-panel">
        <SectionTitle title={t("excludedDomains")} description={t("excludedDomainsSubtitle")} />
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={addExclusion}>
          <Input
            value={excludeInput}
            onChange={(event) => setExcludeInput(event.target.value)}
            placeholder="example.com"
            aria-label={t("exclusionRuleInputLabel")}
          />
          <Button type="submit" aria-label={t("addExclusion")}>{t("addExclusion")}</Button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {settings.excludedDomains.length === 0 ? (
            <span className="text-sm text-muted-foreground">{t("noExcludedDomains")}</span>
          ) : settings.excludedDomains.map((domain) => (
            <Badge key={domain} variant="secondary" className="gap-2 py-1">
              {domain}
              <button
                type="button"
                className="rounded-full px-1 text-muted-foreground hover:text-foreground"
                onClick={() => updateSettings((current) => ({
                  ...current,
                  excludedDomains: current.excludedDomains.filter((entry) => entry !== domain)
                }))}
                aria-label={`${t("remove")} ${domain}`}
              >
                x
              </button>
            </Badge>
          ))}
        </div>
      </section>

      <footer className="save-bar">
        <Button className="min-w-40" onClick={() => void save()}>
          <Save className="h-4 w-4" />
          {t("saveChanges")}
        </Button>
        <span className="text-sm text-muted-foreground" role="status" aria-live="polite">{status}</span>
      </footer>

      <Dialog open={profileDialog !== null} onOpenChange={(open) => !open && setProfileDialog(null)}>
        {profileDialog ? (
          <ProfileEditorDialog
            state={profileDialog}
            hideUserAgentFields={settings.disableUserAgentSpoofing}
            onDraftChange={(draft) => setProfileDialog((current) => current ? { ...current, draft } : current)}
            onCancel={() => setProfileDialog(null)}
            onSave={saveProfileDraft}
          />
        ) : null}
      </Dialog>
    </main>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }): React.ReactElement {
  return (
    <div>
      <h2>{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function ProfilesTable({
  profiles,
  hideUserAgentFields,
  onEdit,
  onDelete
}: {
  profiles: Profile[];
  hideUserAgentFields: boolean;
  onEdit: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
}): React.ReactElement {
  return (
    <Table className="mt-5">
      <TableHeader>
        <TableRow>
          <TableHead>{t("profile")}</TableHead>
          <TableHead>{t("locale")}</TableHead>
          <TableHead>{t("timezoneLocation")}</TableHead>
          {!hideUserAgentFields ? <TableHead>{t("platform")}</TableHead> : null}
          <TableHead>{t("hardwareSummary")}</TableHead>
          <TableHead>{t("webglSummary")}</TableHead>
          <TableHead className="w-36 text-right">{t("actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {profiles.map((profile) => (
          <TableRow key={profile.id}>
            <TableCell>
              <div className="flex min-w-52 flex-col gap-1">
                <span className="font-medium">{profile.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{profile.id}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="min-w-36 text-sm">
                <div>{profile.locale}</div>
                <div className="text-xs text-muted-foreground">{profile.languages.join(", ")}</div>
              </div>
            </TableCell>
            <TableCell>
              <div className="min-w-48 text-sm">
                <div>{profile.timezoneId}</div>
                <div className="text-xs text-muted-foreground">{profile.latitude.toFixed(3)}, {profile.longitude.toFixed(3)}</div>
              </div>
            </TableCell>
            {!hideUserAgentFields ? <TableCell>{platformLabel(profile.platform)}</TableCell> : null}
            <TableCell>
              <span className="text-sm">{profile.hardwareConcurrency} CPU / {profile.deviceMemory} GB</span>
            </TableCell>
            <TableCell>
              <div className="max-w-56 truncate text-sm" title={`${profile.webglVendor} ${profile.webglRenderer}`}>
                {profile.webglVendor}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => onEdit(profile)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  {t("edit")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(profile)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("delete")}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProfileEditorDialog({
  state,
  hideUserAgentFields,
  onDraftChange,
  onCancel,
  onSave
}: {
  state: ProfileDialogState;
  hideUserAgentFields: boolean;
  onDraftChange: (profile: Profile) => void;
  onCancel: () => void;
  onSave: (profile: Profile) => void;
}): React.ReactElement {
  const draft = state.draft;
  const [languageText, setLanguageText] = React.useState(() => draft.languages.join(", "));
  const [numberText, setNumberText] = React.useState<NumberFieldText>(() => numberTextFromProfile(draft));

  React.useEffect(() => {
    setLanguageText(draft.languages.join(", "));
    setNumberText(numberTextFromProfile(draft));
  }, [draft.id]);

  const update = <K extends keyof Profile,>(key: K, value: Profile[K]) => {
    onDraftChange({ ...draft, [key]: value });
  };
  const updateNumberText = (key: NumberFieldKey, value: string) => {
    setNumberText((current) => ({ ...current, [key]: value }));
  };
  const commitNumberText = (key: NumberFieldKey) => {
    const numeric = numberFromText(numberText[key], draft[key]);
    setNumberText((current) => ({ ...current, [key]: String(numeric) }));
    update(key, numeric);
  };
  const commitLanguageText = () => {
    const languages = splitList(languageText);
    setLanguageText(languages.join(", "));
    update("languages", languages);
  };
  const applyLocale = (locale: string) => {
    const next = applyLocalePreset(withRawProfileEdits(draft, languageText, numberText), locale);
    setLanguageText(next.languages.join(", "));
    setNumberText(numberTextFromProfile(next));
    onDraftChange(next);
  };
  const saveDraft = () => onSave(withRawProfileEdits(draft, languageText, numberText));

  return (
    <DialogContent
      onInteractOutside={(event) => event.preventDefault()}
      onPointerDownOutside={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{state.mode === "create" ? t("addProfile") : t("editProfile")}</DialogTitle>
        <DialogDescription>{t("profilesSubtitle")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("label")}>
            <Input aria-label={t("label")} value={draft.label} onChange={(event) => update("label", event.target.value)} />
          </Field>
          <Field label={t("profileId")}>
            <Input aria-label={t("profileId")} value={draft.id} disabled />
          </Field>
          <Field label={t("locale")}>
            <Select value={draft.locale} onValueChange={applyLocale}>
              <SelectTrigger aria-label={t("locale")}>
                <SelectValue placeholder={t("selectLocale")} />
              </SelectTrigger>
              <SelectContent>
                {LOCALE_PRESETS.map((preset) => (
                  <SelectItem key={preset.locale} value={preset.locale}>{preset.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!hideUserAgentFields ? (
            <>
              <Field label={t("platform")}>
                <Select value={draft.platform} onValueChange={(value) => update("platform", value)}>
                  <SelectTrigger aria-label={t("platform")}>
                    <SelectValue placeholder={t("selectPlatform")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("architecture")}>
                <Select value={draft.architecture} onValueChange={(value) => update("architecture", value)}>
                  <SelectTrigger aria-label={t("architecture")}>
                    <SelectValue placeholder={t("selectArchitecture")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ARCHITECTURE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <Field label={t("languages")}>
            <Input
              aria-label={t("languages")}
              value={languageText}
              onBlur={commitLanguageText}
              onChange={(event) => setLanguageText(event.target.value)}
            />
          </Field>
          <Field label={t("acceptLanguage")}>
            <Input aria-label={t("acceptLanguage")} value={draft.acceptLanguage} onChange={(event) => update("acceptLanguage", event.target.value)} />
          </Field>
          <Field label={t("intlLocale")}>
            <Input aria-label={t("intlLocale")} value={draft.intlLocale} onChange={(event) => update("intlLocale", event.target.value)} />
          </Field>
          <Field label={t("timezone")} className="md:col-span-2">
            <TimezonePicker
              profile={draft}
              onTimezoneChange={(timezoneId) => update("timezoneId", timezoneId)}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t("latitude")}>
            <Input
              aria-label={t("latitude")}
              inputMode="decimal"
              value={numberText.latitude}
              onBlur={() => commitNumberText("latitude")}
              onChange={(event) => updateNumberText("latitude", event.target.value)}
            />
          </Field>
          <Field label={t("longitude")}>
            <Input
              aria-label={t("longitude")}
              inputMode="decimal"
              value={numberText.longitude}
              onBlur={() => commitNumberText("longitude")}
              onChange={(event) => updateNumberText("longitude", event.target.value)}
            />
          </Field>
          <Field label={t("accuracy")}>
            <Input
              aria-label={t("accuracy")}
              inputMode="decimal"
              value={numberText.accuracy}
              onBlur={() => commitNumberText("accuracy")}
              onChange={(event) => updateNumberText("accuracy", event.target.value)}
            />
          </Field>
        </div>

        <details className="rounded-lg border border-border/70 bg-background/40 p-4">
          <summary className="cursor-pointer text-sm font-medium">{t("advancedSettings")}</summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t("hardwareConcurrency")}>
              <Input
                aria-label={t("hardwareConcurrency")}
                inputMode="numeric"
                value={numberText.hardwareConcurrency}
                onBlur={() => commitNumberText("hardwareConcurrency")}
                onChange={(event) => updateNumberText("hardwareConcurrency", event.target.value)}
              />
            </Field>
            <Field label={t("deviceMemory")}>
              <Input
                aria-label={t("deviceMemory")}
                inputMode="numeric"
                value={numberText.deviceMemory}
                onBlur={() => commitNumberText("deviceMemory")}
                onChange={(event) => updateNumberText("deviceMemory", event.target.value)}
              />
            </Field>
            {!hideUserAgentFields ? (
              <Field label={t("userAgent")} className="md:col-span-2">
                <Textarea aria-label={t("userAgent")} value={draft.userAgent} onChange={(event) => update("userAgent", event.target.value)} />
              </Field>
            ) : null}
            <Field label={t("webglVendor")}>
              <Input aria-label={t("webglVendor")} value={draft.webglVendor} onChange={(event) => update("webglVendor", event.target.value)} />
            </Field>
            <Field label={t("webglRenderer")} className="md:col-span-2">
              <Textarea aria-label={t("webglRenderer")} value={draft.webglRenderer} onChange={(event) => update("webglRenderer", event.target.value)} />
            </Field>
          </div>
        </details>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
        <Button onClick={saveDraft}>{t("saveProfile")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={className}>
      <Label className="mb-2 block text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function numberTextFromProfile(profile: Profile): NumberFieldText {
  return {
    latitude: String(profile.latitude),
    longitude: String(profile.longitude),
    accuracy: String(profile.accuracy),
    hardwareConcurrency: String(profile.hardwareConcurrency),
    deviceMemory: String(profile.deviceMemory)
  };
}

function numberFromText(value: string, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function withRawProfileEdits(profile: Profile, languageText: string, numberText: NumberFieldText): Profile {
  return {
    ...profile,
    languages: splitList(languageText),
    latitude: numberFromText(numberText.latitude, profile.latitude),
    longitude: numberFromText(numberText.longitude, profile.longitude),
    accuracy: numberFromText(numberText.accuracy, profile.accuracy),
    hardwareConcurrency: numberFromText(numberText.hardwareConcurrency, profile.hardwareConcurrency),
    deviceMemory: numberFromText(numberText.deviceMemory, profile.deviceMemory)
  };
}

function TimezonePicker({
  profile,
  onTimezoneChange
}: {
  profile: Profile;
  onTimezoneChange: (timezoneId: string) => void;
}): React.ReactElement {
  const selectedTimezoneId = normalizeTimezoneId(profile.timezoneId);
  const profileRegion = timezoneRegion(selectedTimezoneId);
  const [region, setRegion] = React.useState(profileRegion);
  const regions = React.useMemo(() => timezoneRegions(selectedTimezoneId), [selectedTimezoneId]);
  const regionTimezones = React.useMemo(() => timezonesForRegion(region, selectedTimezoneId), [region, selectedTimezoneId]);
  const effectiveTimezoneId = regionTimezones.includes(selectedTimezoneId)
    ? selectedTimezoneId
    : regionTimezones[0] ?? selectedTimezoneId;

  React.useEffect(() => {
    setRegion(profileRegion);
  }, [profileRegion]);

  const handleRegionChange = React.useCallback((nextRegion: string) => {
    setRegion(nextRegion);
    const nextTimezones = timezonesForRegion(nextRegion, selectedTimezoneId);
    if (!nextTimezones.includes(selectedTimezoneId) && nextTimezones[0]) {
      onTimezoneChange(nextTimezones[0]);
    }
  }, [onTimezoneChange, selectedTimezoneId]);

  return (
    <div className="timezone-controls">
      <Select value={region} onValueChange={handleRegionChange}>
        <SelectTrigger aria-label={t("region")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {regions.map((entry) => (
            <SelectItem key={entry} value={entry}>{entry}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={effectiveTimezoneId} onValueChange={onTimezoneChange}>
        <SelectTrigger aria-label={t("timezone")}>
          <SelectValue placeholder={t("selectTimezone")} />
        </SelectTrigger>
        <SelectContent>
          {regionTimezones.map((entry) => (
            <SelectItem key={entry} value={entry}>{timezoneLabel(entry)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    id: profile.id.trim(),
    label: profile.label.trim() || t("profile"),
    locale: profile.locale.trim(),
    intlLocale: profile.intlLocale.trim(),
    languages: profile.languages.map((entry) => entry.trim()).filter(Boolean),
    timezoneId: normalizeTimezoneId(profile.timezoneId.trim()),
    acceptLanguage: profile.acceptLanguage.trim(),
    platform: profile.platform.trim() || "Win32",
    architecture: normalizeArchitecture(profile.architecture),
    userAgent: typeof profile.userAgent === "string" ? profile.userAgent.trim() : "",
    uaMode: "desktop-chromium",
    canvasSeedPolicy: "site",
    latitude: finiteOr(profile.latitude, 0),
    longitude: finiteOr(profile.longitude, 0),
    accuracy: finiteOr(profile.accuracy, 80),
    hardwareConcurrency: Math.max(1, Math.round(finiteOr(profile.hardwareConcurrency, 8))),
    deviceMemory: Math.max(1, Math.round(finiteOr(profile.deviceMemory, 8))),
    webglVendor: profile.webglVendor.trim(),
    webglRenderer: profile.webglRenderer.trim()
  };
}

function splitList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeArchitecture(value: unknown): string {
  return value === "arm" ? "arm" : "x86";
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

function platformLabel(value: string): string {
  return PLATFORM_OPTIONS.find((option) => option.value === value)?.label ?? value;
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
