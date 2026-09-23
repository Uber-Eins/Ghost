import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({
  id,
  icon: Icon,
  title,
  description,
  actions,
  children,
  className
}: {
  id: string;
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section id={id} className={cn("scroll-mt-8", className)} aria-labelledby={`${id}-title`}>
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="section-icon mt-0.5">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`}>{title}</h2>
            {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
