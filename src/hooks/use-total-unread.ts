"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Count of conversations with at least one unread inbound message for
 * the current user. Used by the sidebar to surface a green dot on the
 * Inbox nav entry when the user is elsewhere in the app.
 *
 * Lives on its own realtime channel (distinct from the inbox page's
 * "inbox-realtime") so both can coexist without sharing state.
 */
export function useTotalUnread(): number {
  const [total, setTotal] = useState(0);
  const { accountId } = useAuth();

  useEffect(() => {
    if (!accountId) {
      setTotal(0);
      return;
    }

    const supabase = createClient();
    let cancelled = false;
    let refreshTimer: number | undefined;
    let requestSequence = 0;

    const refreshCount = async () => {
      const sequence = ++requestSequence;
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("account_id", accountId)
        .gt("unread_count", 0);
      if (cancelled || sequence !== requestSequence) return;
      if (error) {
        console.error("[useTotalUnread] Failed to count unread conversations:", error.message);
        return;
      }
      setTotal(count ?? 0);
    };

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshCount(), 250);
    };

    void refreshCount();

    const channel = supabase
      .channel("total-unread-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `account_id=eq.${accountId}`,
        },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") scheduleRefresh();
      });

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [accountId]);

  return total;
}
