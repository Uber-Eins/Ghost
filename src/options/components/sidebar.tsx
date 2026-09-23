import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { t } from "../../shared/i18n";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export function Sidebar({
  items,
  activeId,
  isAdvancedBuild,
  version,
  protectionAvailable,
  onNavigate
}: {
  items: NavItem[];
  activeId: string;
  isAdvancedBuild: boolean;
  version: string;
  protectionAvailable: boolean | null;
  onNavigate: (id: string) => void;
}): React.ReactElement {
  return (
    <aside className="sidebar">
      <div className="mb-5 flex items-center gap-3 px-2">
        <img src="icons/enabled-48.png" width="40" height="40" className="h-10 w-10 rounded-xl ring-1 ring-border" alt="" />
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight">Ghost</div>
          <div className="text-xs text-muted-foreground">{t("options")}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5" aria-label={t("options")}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="nav-link"
            data-active={item.id === activeId}
            aria-current={item.id === activeId ? "location" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot mt-auto flex flex-col gap-3 px-2 pt-6">
        <StatusPill available={protectionAvailable} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={isAdvancedBuild ? "success" : "outline"}>
            {isAdvancedBuild ? t("buildAdvancedLabel") : t("buildLiteLabel")}
          </Badge>
          <span className="font-mono">v{version}</span>
        </div>
      </div>
    </aside>
  );
}

export function StatusPill({ available }: { available: boolean | null }): React.ReactElement {
  if (available === null) {
    return <span className="status-pill" data-tone="muted">{t("loadingSettings")}</span>;
  }
  return (
    <span className="status-pill" data-tone={available ? "ok" : "danger"}>
      {available ? t("protected") : t("unprotected")}
    </span>
  );
}
