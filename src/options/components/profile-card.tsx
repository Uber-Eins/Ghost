import * as React from "react";
import { Clock, Cpu, Languages, MapPin, MemoryStick, Monitor, Pencil, Plus, Route, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { t } from "../../shared/i18n";
import { ARCHITECTURE_OPTIONS, PLATFORM_OPTIONS } from "../../shared/locations";
import { utcOffsetLabel, utcOffsetMinutes } from "../../shared/timezone";
import type { Profile } from "../../shared/types";

export function ProfileCard({
  profile,
  isPreset,
  usedByRules,
  canDelete,
  hideUserAgentFields,
  hideWebglFields,
  onEdit,
  onDelete
}: {
  profile: Profile;
  isPreset: boolean;
  usedByRules: number;
  canDelete: boolean;
  hideUserAgentFields: boolean;
  hideWebglFields: boolean;
  onEdit: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const timezoneOffset = React.useMemo(() => utcOffsetMinutes(profile.timezoneId), [profile.timezoneId]);
  return (
    <article
      className="panel flex flex-col p-4"
      style={{ "--profile-hue": profileHue(profile.id) } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <div className="profile-avatar" aria-hidden="true">{regionFlag(profile.locale)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold leading-tight">{profile.label}</h3>
            <Badge variant={isPreset ? "outline" : "soft"}>{isPreset ? t("preset") : t("custom")}</Badge>
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{profile.id}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-1.5 text-[13px]">
        <Detail icon={Languages} label={t("locale")}>
          <span className="font-medium">{profile.locale}</span>
          <span className="text-muted-foreground"> · {profile.languages.join(", ")}</span>
        </Detail>
        <Detail icon={Clock} label={t("timezone")}>
          {profile.timezoneId}
          {timezoneOffset !== null ? <span className="text-muted-foreground"> · {utcOffsetLabel(timezoneOffset)}</span> : null}
        </Detail>
        <Detail icon={MapPin} label={t("coordinates")}>
          <span className="font-mono text-xs">{profile.latitude.toFixed(3)}, {profile.longitude.toFixed(3)}</span>
          <span className="text-muted-foreground"> · ±{Math.round(profile.accuracy)} m</span>
        </Detail>
        {!hideUserAgentFields ? (
          <Detail icon={Monitor} label={t("platform")}>
            {platformLabel(profile.platform)}
            <span className="text-muted-foreground"> · {architectureLabel(profile.architecture)}</span>
          </Detail>
        ) : null}
        <Detail icon={MemoryStick} label={t("deviceMemory")}>{profile.deviceMemory} GB</Detail>
        {!hideWebglFields ? (
          <Detail icon={Cpu} label={t("webglSummary")}>
            <span title={`${profile.webglVendor}\n${profile.webglRenderer}`}>{profile.webglVendor || "—"}</span>
          </Detail>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={t("siteRules")}>
          {usedByRules > 0 ? (
            <>
              <Route className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">{t("siteRules")}: </span>
              ×{usedByRules}
            </>
          ) : null}
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t("edit")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-destructive/10 hover:text-destructive"
            disabled={!canDelete}
            onClick={onDelete}
            aria-label={`${t("deleteProfile")}: ${profile.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("delete")}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function AddProfileCard({ onClick }: { onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-input bg-card/40 p-4 text-muted-foreground transition-colors hover:border-primary/60 hover:bg-accent/40 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-muted transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Plus className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold">{t("addProfile")}</span>
      <span className="max-w-56 text-center text-xs">{t("addProfileHint")}</span>
    </button>
  );
}

function Detail({
  icon: Icon,
  label,
  children
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

export function regionFlag(locale: string): string {
  const region = locale.split(/[-_]/)[1]?.toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(region)) {
    return "🌐";
  }
  return String.fromCodePoint(...[...region].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

function profileHue(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return `oklch(0.7 0.16 ${hash % 360})`;
}

function platformLabel(value: string): string {
  return PLATFORM_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function architectureLabel(value: string): string {
  return ARCHITECTURE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
