import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./ui/dialog";
import { t } from "../../shared/i18n";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(460px,calc(100vw-32px))]">
        <DialogHeader className="items-start">
          <span
            className={cn(
              "mb-2 grid h-11 w-11 place-items-center rounded-xl",
              destructive ? "bg-destructive/12 text-destructive" : "bg-accent text-accent-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
