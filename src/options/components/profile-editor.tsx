import * as React from "react";
import { Keyboard, Languages, MapPin, Monitor, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { t } from "../../shared/i18n";
import {
  ARCHITECTURE_OPTIONS,
  applyLocalePreset,
  FIXED_OFFSET_REGION,
  LOCALE_PRESETS,
  normalizeTimezoneId,
  PLATFORM_OPTIONS,
  timezoneLabel,
  timezoneRegion,
  timezoneRegions,
  timezonesForRegion
} from "../../shared/locations";
import { fixedOffsetMinutes, utcOffsetLabel, utcOffsetMinutes } from "../../shared/timezone";
import { normalizedPlatformVersionOverride, userAgentMetadataForProfile } from "../../shared/profiles";
import { automaticScreenPanel, normalizeScreenResolution, SCREEN_RESOLUTIONS } from "../../shared/screen";
import { automaticKeyboardLayout, KEYBOARD_LAYOUTS, normalizeKeyboardLayout } from "../../shared/keyboard";
import { automaticVoiceLocales, normalizeVoices, WINDOWS_VOICE_LOCALES } from "../../shared/voices";
import type { Profile } from "../../shared/types";
import { regionFlag } from "./profile-card";

export type ProfileDialogState = {
  mode: "create" | "edit";
  draft: Profile;
};

type NumberFieldKey = keyof Pick<Profile, "latitude" | "longitude" | "accuracy" | "deviceMemory">;
type NumberFieldText = Record<NumberFieldKey, string>;

export function ProfileEditorDialog({
  state,
  hideUserAgentFields,
  hideWebglFields,
  onDraftChange,
  onCancel,
  onSave
}: {
  state: ProfileDialogState;
  hideUserAgentFields: boolean;
  hideWebglFields: boolean;
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
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-2xl leading-none" aria-hidden="true">
            {regionFlag(draft.locale)}
          </span>
          <div className="min-w-0">
            <DialogTitle>{state.mode === "create" ? t("addProfile") : t("editProfile")}</DialogTitle>
            <DialogDescription className="mt-1 truncate font-mono text-xs">{draft.id}</DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="grid gap-4">
        <EditorGroup icon={UserRound} title={t("sectionIdentity")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("label")}>
              <Input aria-label={t("label")} value={draft.label} onChange={(event) => update("label", event.target.value)} />
            </Field>
            <Field label={t("profileId")}>
              <Input aria-label={t("profileId")} className="font-mono text-xs" value={draft.id} disabled />
            </Field>
          </div>
        </EditorGroup>

        <EditorGroup icon={Languages} title={t("sectionLanguage")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("locale")}>
              <Select value={draft.locale} onValueChange={applyLocale}>
                <SelectTrigger aria-label={t("locale")}>
                  <SelectValue placeholder={t("selectLocale")} />
                </SelectTrigger>
                <SelectContent>
                  {LOCALE_PRESETS.map((preset) => (
                    <SelectItem key={preset.locale} value={preset.locale}>
                      <span className="mr-2" aria-hidden="true">{regionFlag(preset.locale)}</span>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("intlLocale")}>
              <Input aria-label={t("intlLocale")} value={draft.intlLocale} onChange={(event) => update("intlLocale", event.target.value)} />
            </Field>
            <Field label={t("languages")} hint={t("languagesHint")}>
              <Input
                aria-label={t("languages")}
                value={languageText}
                onBlur={commitLanguageText}
                onChange={(event) => setLanguageText(event.target.value)}
              />
            </Field>
            <Field label={t("acceptLanguage")}>
              <Input
                aria-label={t("acceptLanguage")}
                className="font-mono text-xs"
                value={draft.acceptLanguage}
                onChange={(event) => update("acceptLanguage", event.target.value)}
              />
            </Field>
          </div>
        </EditorGroup>

        <EditorGroup icon={MapPin} title={t("sectionLocation")}>
          <div className="grid gap-4">
            <Field label={t("timezone")}>
              <TimezonePicker profile={draft} onTimezoneChange={(timezoneId) => update("timezoneId", timezoneId)} />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={t("latitude")}>
                <Input
                  aria-label={t("latitude")}
                  inputMode="decimal"
                  className="font-mono"
                  value={numberText.latitude}
                  onBlur={() => commitNumberText("latitude")}
                  onChange={(event) => updateNumberText("latitude", event.target.value)}
                />
              </Field>
              <Field label={t("longitude")}>
                <Input
                  aria-label={t("longitude")}
                  inputMode="decimal"
                  className="font-mono"
                  value={numberText.longitude}
                  onBlur={() => commitNumberText("longitude")}
                  onChange={(event) => updateNumberText("longitude", event.target.value)}
                />
              </Field>
              <Field label={`${t("accuracy")} (m)`}>
                <Input
                  aria-label={t("accuracy")}
                  inputMode="decimal"
                  className="font-mono"
                  value={numberText.accuracy}
                  onBlur={() => commitNumberText("accuracy")}
                  onChange={(event) => updateNumberText("accuracy", event.target.value)}
                />
              </Field>
            </div>
          </div>
        </EditorGroup>

        <EditorGroup icon={Monitor} title={t("sectionDevice")}>
          <div className="grid gap-4 md:grid-cols-3">
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
                <Field label={t("platformVersion")} hint={t("platformVersionHint")}>
                  <Input
                    aria-label={t("platformVersion")}
                    className="font-mono"
                    inputMode="decimal"
                    placeholder={userAgentMetadataForProfile({ ...draft, platformVersion: "" })?.platformVersion ?? ""}
                    value={draft.platformVersion}
                    onChange={(event) => update("platformVersion", event.target.value)}
                  />
                </Field>
              </>
            ) : null}
            <Field label={`${t("deviceMemory")} (GB)`}>
              <Input
                aria-label={t("deviceMemory")}
                inputMode="numeric"
                className="font-mono"
                value={numberText.deviceMemory}
                onBlur={() => commitNumberText("deviceMemory")}
                onChange={(event) => updateNumberText("deviceMemory", event.target.value)}
              />
            </Field>
            {!hideUserAgentFields ? (
              <Field label={t("userAgent")} className="md:col-span-3">
                <Textarea
                  aria-label={t("userAgent")}
                  className="min-h-16"
                  value={draft.userAgent}
                  onChange={(event) => update("userAgent", event.target.value)}
                />
              </Field>
            ) : null}
            {!hideWebglFields ? (
              <>
                <Field label={t("webglVendor")}>
                  <Input aria-label={t("webglVendor")} value={draft.webglVendor} onChange={(event) => update("webglVendor", event.target.value)} />
                </Field>
                <Field label={t("webglRenderer")} className="md:col-span-2">
                  <Textarea
                    aria-label={t("webglRenderer")}
                    className="min-h-16"
                    value={draft.webglRenderer}
                    onChange={(event) => update("webglRenderer", event.target.value)}
                  />
                </Field>
              </>
            ) : null}
          </div>
        </EditorGroup>

        <EditorGroup icon={Keyboard} title={t("sectionDisplayInput")}>
          <DisplayInputFields key={draft.id} draft={draft} onDraftChange={onDraftChange} />
        </EditorGroup>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
        <Button onClick={saveDraft}>{t("saveProfile")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DisplayInputFields({ draft, onDraftChange }: { draft: Profile; onDraftChange: (profile: Profile) => void }): React.ReactElement {
  const fixed = typeof draft.screenResolution === "object" ? draft.screenResolution : null;
  const panelValue = fixed ? `${fixed.width}x${fixed.height}` : "auto";
  const isPanel = SCREEN_RESOLUTIONS.some(([width, height]) => `${width}x${height}` === panelValue);
  const [customScreen, setCustomScreen] = React.useState(!!fixed && !isPanel);
  const [widthText, setWidthText] = React.useState(String(fixed?.width ?? 1920));
  const [heightText, setHeightText] = React.useState(String(fixed?.height ?? 1080));
  const [chooseVoices, setChooseVoices] = React.useState(Array.isArray(draft.voices));
  const [voiceText, setVoiceText] = React.useState(Array.isArray(draft.voices) ? draft.voices.join(", ") : "");
  const autoPanel = automaticScreenPanel(draft, window.devicePixelRatio);
  const keyboardLabels = { us: t("keyboardUS"), uk: t("keyboardUK"), de: t("keyboardGerman"), fr: t("keyboardFrench"), jp: t("keyboardJapanese") };
  const voiceHint = chooseVoices
    ? `${t("availableVoicePacks")} ${WINDOWS_VOICE_LOCALES.join(", ")}. ${t("voicePackOrderHint")}`
    : draft.voices !== "none"
      ? `${t("automaticVoicePacks")} ${automaticVoiceLocales(draft).join(", ") || t("noLocalVoices")}` : "";
  const commitScreen = () => {
    const resolution = normalizeScreenResolution({ width: Number(widthText), height: Number(heightText) });
    if (resolution === "auto") {
      setWidthText(String(fixed?.width ?? 1920));
      setHeightText(String(fixed?.height ?? 1080));
      return;
    }
    setWidthText(String(resolution.width));
    setHeightText(String(resolution.height));
    onDraftChange({ ...draft, screenResolution: resolution });
  };
  const commitVoices = () => {
    const voices = normalizeVoices(splitList(voiceText));
    setVoiceText(Array.isArray(voices) ? voices.join(", ") : "");
    onDraftChange({ ...draft, voices });
  };
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Field label={t("screenResolution")} hint={t("screenResolutionHint")}>
        <Select value={customScreen ? "custom" : panelValue} onValueChange={(value) => {
          setCustomScreen(value === "custom");
          if (value === "auto") onDraftChange({ ...draft, screenResolution: "auto" });
          else {
            const [width, height] = value === "custom" ? [Number(widthText), Number(heightText)] : value.split("x").map(Number);
            setWidthText(String(width));
            setHeightText(String(height));
            onDraftChange({ ...draft, screenResolution: normalizeScreenResolution({ width, height }) });
          }
        }}>
          <SelectTrigger aria-label={t("screenResolution")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("automatic")} ({autoPanel[0]}x{autoPanel[1]})</SelectItem>
            {SCREEN_RESOLUTIONS.map(([width, height]) => <SelectItem key={`${width}x${height}`} value={`${width}x${height}`}>{width} x {height}</SelectItem>)}
            <SelectItem value="custom">{t("customResolution")}</SelectItem>
          </SelectContent>
        </Select>
        {customScreen ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input aria-label={t("screenWidth")} type="number" min={640} max={7680} step={1} className="font-mono" value={widthText} onChange={(event) => setWidthText(event.target.value)} onBlur={commitScreen} />
            <Input aria-label={t("screenHeight")} type="number" min={480} max={4320} step={1} className="font-mono" value={heightText} onChange={(event) => setHeightText(event.target.value)} onBlur={commitScreen} />
          </div>
        ) : null}
      </Field>
      <Field label={t("keyboardLayout")}>
        <Select value={draft.keyboardLayout ?? "auto"} onValueChange={(value) => onDraftChange({ ...draft, keyboardLayout: normalizeKeyboardLayout(value) })}>
          <SelectTrigger aria-label={t("keyboardLayout")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("automatic")} ({keyboardLabels[automaticKeyboardLayout(draft)]})</SelectItem>
            {KEYBOARD_LAYOUTS.map((layout) => <SelectItem key={layout} value={layout}>{keyboardLabels[layout]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t("speechVoices")} hint={`${voiceHint} ${t("windowsPlatformOnly")}`}>
        <Select value={chooseVoices ? "choose" : draft.voices === "none" ? "none" : "auto"} onValueChange={(value) => {
          setChooseVoices(value === "choose");
          onDraftChange({ ...draft, voices: value === "choose" ? normalizeVoices(splitList(voiceText)) : value === "none" ? "none" : "auto" });
        }}>
          <SelectTrigger aria-label={t("speechVoices")}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("automatic")}</SelectItem>
            <SelectItem value="none">{t("noLocalVoices")}</SelectItem>
            <SelectItem value="choose">{t("chooseVoicePacks")}</SelectItem>
          </SelectContent>
        </Select>
        {chooseVoices ? <Input className="mt-2" aria-label={t("voicePacks")} value={voiceText} onChange={(event) => setVoiceText(event.target.value)} onBlur={commitVoices} /> : null}
      </Field>
    </div>
  );
}

function EditorGroup({
  icon: Icon,
  title,
  children
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="editor-group">
      <div className="editor-group-title">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
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

  // Current UTC offsets for the visible region only; fixed-offset zones carry
  // the offset in their label already.
  const offsetLabels = React.useMemo(() => new Map(regionTimezones.map((entry) => {
    if (fixedOffsetMinutes(entry) !== null) {
      return [entry, ""] as const;
    }
    const offset = utcOffsetMinutes(entry);
    return [entry, offset === null ? "" : utcOffsetLabel(offset)] as const;
  })), [regionTimezones]);

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
            <SelectItem key={entry} value={entry}>
              {entry === FIXED_OFFSET_REGION ? t("regionFixedOffset") : entry}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={effectiveTimezoneId} onValueChange={onTimezoneChange}>
        <SelectTrigger aria-label={t("timezone")}>
          <SelectValue placeholder={t("selectTimezone")} />
        </SelectTrigger>
        <SelectContent>
          {regionTimezones.map((entry) => (
            <SelectItem key={entry} value={entry}>
              <span className="inline-flex w-full items-baseline justify-between gap-4">
                <span>{timezoneLabel(entry)}</span>
                {offsetLabels.get(entry) ? (
                  <span className="font-mono text-xs text-muted-foreground">{offsetLabels.get(entry)}</span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function normalizeProfileDraft(profile: Profile): Profile {
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
    platformVersion: normalizedPlatformVersionOverride(profile.platformVersion) ?? "",
    userAgent: typeof profile.userAgent === "string" ? profile.userAgent.trim() : "",
    uaMode: "desktop-chromium",
    screenResolution: normalizeScreenResolution(profile.screenResolution),
    keyboardLayout: normalizeKeyboardLayout(profile.keyboardLayout),
    voices: normalizeVoices(profile.voices),
    canvasSeedPolicy: "site",
    latitude: finiteOr(profile.latitude, 0),
    longitude: finiteOr(profile.longitude, 0),
    accuracy: finiteOr(profile.accuracy, 80),
    deviceMemory: Math.max(1, Math.round(finiteOr(profile.deviceMemory, 8))),
    webglVendor: profile.webglVendor.trim(),
    webglRenderer: profile.webglRenderer.trim()
  };
}

function numberTextFromProfile(profile: Profile): NumberFieldText {
  return {
    latitude: String(profile.latitude),
    longitude: String(profile.longitude),
    accuracy: String(profile.accuracy),
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
    deviceMemory: numberFromText(numberText.deviceMemory, profile.deviceMemory)
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
