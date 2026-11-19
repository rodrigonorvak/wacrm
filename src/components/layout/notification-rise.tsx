"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Notification, NotificationType } from "@/types";

const POP_TYPES = new Set<NotificationType>(["lead_awaiting", "platform_message"]);
const MAX_VISIBLE = 4;

/**
 * Unread lead alerts and admin messages rise from the bottom-right corner.
 * The unread row in the database is the source of truth: a notice stays
 * until it is closed, opened, or resolved (the team replied to the lead).
 * Remounts of the dashboard shell simply reload the same unread rows.
 */
export function NotificationRise() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled || !data) return;
      const unread = (data as Notification[]).filter((notice) => POP_TYPES.has(notice.type));
      setItems(unread.slice(0, MAX_VISIBLE));
    }

    void load();

    const channel = supabase
      .channel(`notification-rise-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as Notification;
          if (row.user_id !== user.id || !POP_TYPES.has(row.type)) return;
          setItems((current) =>
            current.some((notice) => notice.id === row.id)
              ? current
              : [row, ...current].slice(0, MAX_VISIBLE),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new as Notification;
          if (row.user_id !== user.id || row.read_at == null) return;
          setItems((current) => current.filter((notice) => notice.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  async function markRead(id: string) {
    setItems((current) => current.filter((notice) => notice.id !== id));
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .is("read_at", null);
  }

  function open(notice: Notification) {
    void markRead(notice.id);
    if (notice.type === "lead_awaiting" && notice.deal_id) {
      const pipeline = notice.pipeline_id
        ? `?pipeline=${encodeURIComponent(notice.pipeline_id)}`
        : "";
      router.push(`/pipelines/${notice.deal_id}${pipeline}`);
      return;
    }
    router.push("/notifications");
  }

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col-reverse gap-2 lg:bottom-6">
      {items.map((notice, index) => (
        <article
          key={notice.id}
          className={`notice-rise pointer-events-auto rounded-2xl border bg-white p-3 shadow-[0_12px_32px_rgb(15_23_42_/_16%)] ${
            notice.type === "lead_awaiting" ? "border-orange-200" : "border-[#e8eef5]"
          }`}
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => open(notice)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-foreground">{notice.title}</p>
              {notice.body ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notice.body}</p>
              ) : null}
            </button>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => void markRead(notice.id)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
