"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  ClipboardList,
  MessageCircle,
  Phone,
  Plus,
  Smartphone,
  SquarePen,
  CircleCheck,
  Trash2,
  X,
} from "lucide-react";

interface LeadQuickActionsProps {
  canManageLead: boolean;
  phone: string | null;
  conversationId: string | null;
  onAddNote: () => void;
  onScheduleAlert: () => void;
  onChangeStage: () => void;
  onEditInformation: () => void;
  onServiceSteps: () => void;
  onDeleteLead: () => void;
}

type QuickAction = {
  label: string;
  icon: LucideIcon;
  color: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
};

function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function LeadQuickActions({
  canManageLead,
  phone,
  conversationId,
  onAddNote,
  onScheduleAlert,
  onChangeStage,
  onEditInformation,
  onServiceSteps,
  onDeleteLead,
}: LeadQuickActionsProps) {
  const [expanded, setExpanded] = useState(false);
  const cleanPhone = phone ? phoneDigits(phone) : "";
  const whatsappHref = conversationId
    ? `/inbox?c=${conversationId}`
    : cleanPhone
      ? `https://wa.me/${cleanPhone}`
      : undefined;

  const actions: QuickAction[] = [
    { label: "Adicionar Nota", icon: MessageCircle, color: "text-blue-600", onClick: onAddNote, disabled: !canManageLead },
    { label: "Agendar Alerta", icon: AlarmClock, color: "text-orange-600", onClick: onScheduleAlert, disabled: !canManageLead },
    { label: "Alterar Estágio", icon: CircleCheck, color: "text-emerald-600", onClick: onChangeStage, disabled: !canManageLead },
    { label: "Editar Informações", icon: SquarePen, color: "text-violet-600", onClick: onEditInformation, disabled: !canManageLead },
    { label: "Etapas de Atendimento", icon: ClipboardList, color: "text-indigo-600", onClick: onServiceSteps },
    { label: "Excluir Lead", icon: Trash2, color: "text-red-600", onClick: onDeleteLead, disabled: !canManageLead },
    {
      label: "Ligar - Telefone Principal",
      icon: Phone,
      color: "text-cyan-600",
      href: cleanPhone ? `tel:${cleanPhone}` : undefined,
      external: true,
      disabled: !cleanPhone,
    },
    {
      label: "WhatsApp",
      icon: Smartphone,
      color: "text-green-600",
      href: whatsappHref,
      external: Boolean(whatsappHref?.startsWith("https://")),
      disabled: !whatsappHref,
    },
  ];

  function closeAndRun(action: QuickAction) {
    setExpanded(false);
    action.onClick?.();
  }

  return (
    <div className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex max-h-[calc(100dvh-2rem)] flex-col items-end gap-2 sm:right-6 sm:bottom-6">
      {expanded && (
        <nav
          id="lead-quick-actions-list"
          aria-label="Ações do lead"
          className="flex max-h-[calc(100dvh-6rem)] flex-col items-end gap-2 overflow-y-auto p-1"
        >
          {actions.map((action, index) => {
            const Icon = action.icon;
            const className = `inline-flex min-h-10 max-w-[min(21rem,calc(100vw-5rem))] items-center gap-2.5 rounded-full border border-border bg-background px-3.5 text-sm font-semibold text-foreground shadow-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none ${action.disabled ? "pointer-events-none opacity-45" : ""}`;
            const content = <><span className="truncate">{action.label}</span><Icon className={`size-4 shrink-0 ${action.color}`} /></>;
            const animationDelay = `${(actions.length - index - 1) * 35}ms`;

            if (action.href && !action.disabled) {
              if (action.external) {
                return (
                  <a
                    key={action.label}
                    href={action.href}
                    title={action.label}
                    onClick={() => setExpanded(false)}
                    className={className}
                    style={{ animationDelay }}
                    {...(action.href.startsWith("https://") ? { target: "_blank", rel: "noreferrer" } : {})}
                  >
                    {content}
                  </a>
                );
              }
              return (
                <Link
                  key={action.label}
                  href={action.href}
                  title={action.label}
                  onClick={() => setExpanded(false)}
                  className={className}
                  style={{ animationDelay }}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={action.label}
                type="button"
                title={action.label}
                disabled={action.disabled}
                onClick={() => closeAndRun(action)}
                className={className}
                style={{ animationDelay }}
              >
                {content}
              </button>
            );
          })}
        </nav>
      )}
      <button
        type="button"
        aria-label={expanded ? "Fechar ações do lead" : "Abrir ações do lead"}
        aria-expanded={expanded}
        aria-controls="lead-quick-actions-list"
        title={expanded ? "Fechar" : "Ações do lead"}
        onClick={() => setExpanded((current) => !current)}
        className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        {expanded ? <X className="size-5" /> : <Plus className="size-5" />}
      </button>
    </div>
  );
}