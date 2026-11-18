"use client";

import { useEffect, useState } from "react";
import { Pencil, Target, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const clearedContactIds = new Set<string>();
const listeners = new Set<() => void>();

function notifyCleared() {
  listeners.forEach((listener) => listener());
}

function useAdReferralCleared(contactId?: string) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => setTick((value) => value + 1);
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, []);
  return Boolean(contactId && clearedContactIds.has(contactId));
}

/**
 * "Anúncio" chip. When `contactId` is set, hovering reveals edit (explains
 * and removes) and delete. Some contacts already in the base get this flag
 * only because a later message came from an ad.
 */
export function AdSourceBadge({ contactId }: { contactId?: string }) {
  const t = useTranslations("AdSource");
  const hidden = useAdReferralCleared(contactId);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (hidden) return null;

  function stop(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function remove(event: React.SyntheticEvent) {
    stop(event);
    if (!contactId || busy) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("contacts")
      .update({ has_ad_referral: false })
      .eq("id", contactId)
      .select("id")
      .maybeSingle();
    setBusy(false);
    if (error || !data) {
      toast.error(t("removeFailed"));
      return;
    }
    clearedContactIds.add(contactId);
    setEditing(false);
    notifyCleared();
    toast.success(t("removed"));
  }

  return (
    <span
      className="group/ad relative inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-slate-600 dark:bg-slate-800 dark:text-slate-200"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Target className="size-3 shrink-0" aria-hidden="true" />
      {t("advertisement")}
      {contactId ? (
        <span className="inline-flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover/ad:opacity-100 lg:group-focus-within/ad:opacity-100">
          <span
            role="button"
            tabIndex={0}
            aria-label={t("edit")}
            className="inline-flex size-3.5 cursor-pointer items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700"
            onClick={(event) => {
              stop(event);
              setEditing((open) => !open);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                stop(event);
                setEditing((open) => !open);
              }
            }}
          >
            <Pencil className="size-2.5" />
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label={t("remove")}
            aria-disabled={busy}
            className="inline-flex size-3.5 cursor-pointer items-center justify-center rounded hover:bg-red-100 hover:text-red-600"
            onClick={remove}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") void remove(event);
            }}
          >
            <X className="size-2.5" />
          </span>
        </span>
      ) : null}
      {editing ? (
        <span className="absolute top-full left-0 z-30 mt-1 w-56 normal-case rounded-md border border-border bg-popover p-2 text-left text-[11px] font-normal leading-snug text-popover-foreground shadow-md">
          {t("editHint")}
          <span className="mt-2 flex justify-end gap-3">
            <span
              role="button"
              tabIndex={0}
              className="cursor-pointer text-muted-foreground"
              onClick={(event) => {
                stop(event);
                setEditing(false);
              }}
            >
              {t("cancel")}
            </span>
            <span
              role="button"
              tabIndex={0}
              className="cursor-pointer font-semibold text-red-600"
              onClick={remove}
            >
              {t("remove")}
            </span>
          </span>
        </span>
      ) : null}
    </span>
  );
}
