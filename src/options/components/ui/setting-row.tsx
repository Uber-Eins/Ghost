import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingRow({
  icon: Icon,
  title,
  description,
  children,
  disabled,
  className,
  htmlFor
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  htmlFor?: string;
}): React.ReactElement {
  const TitleTag = htmlFor ? "label" : "div";
  return (
    <div className={cn("flex items-start gap-4 px-5 py-4 transition-opacity", disabled && "opacity-55", className)}>
      <div className="icon-tile mt-0.5">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <TitleTag htmlFor={htmlFor} className="block text-sm font-semibold leading-snug">
          {title}
        </TitleTag>
        {description ? (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2 pt-1">{children}</div> : null}
    </div>
  );
}
