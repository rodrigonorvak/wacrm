"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTranslations } from "next-intl";

export function useScheduledContacts() {
  const { accountId } = useAuth();
  const t = useTranslations("ScheduledMessages");
  const [contacts, setContacts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!accountId) return;
    const supabase = createClient();
    let cancelled = false;
    let generation = 0;
    async function load() {
      const request = ++generation;
      const found = new Set<string>();
      let start = 0;
      for (;;) {
        const { data, error } = await supabase.from("scheduled_whatsapp_messages")
          .select("contact_id").eq("account_id", accountId)
          .in("status", ["pending", "processing", "uncertain"])
          .order("id").range(start, start + 999);
        if (error) {
          if (!cancelled && request === generation) {
            console.error("Failed to load scheduled message indicators:", error);
            toast.error(t("indicatorError"));
          }
          return;
        }
        for (const row of data ?? []) found.add(row.contact_id as string);
        if (!data || data.length < 1000) break;
        start += 1000;
      }
      if (!cancelled && request === generation) setContacts(found);
    }
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("scheduled-messages-changed", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      window.removeEventListener("scheduled-messages-changed", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [accountId, t]);
  return contacts;
}
