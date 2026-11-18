"use client"

import Link from 'next/link'
import { UserPlus, Briefcase, Radio, Zap } from 'lucide-react'
import type { ComponentType } from 'react'

import { useTranslations } from 'next-intl'

// Quick-action shortcuts. Each navigates to the page that owns the
// relevant "create" flow. We deliberately don't try to auto-open any
// modal on the target page — that'd require touching those pages,
// which is out of scope here.
interface Action {
  labelKey: string
  href: string
  icon: ComponentType<{ className?: string }>
  /** Classes for the round icon badge (tint background + icon color). */
  tint: string
}

const ACTIONS: Action[] = [
  { labelKey: 'newContact', href: '/contacts', icon: UserPlus, tint: 'bg-primary/10 text-primary' },
  { labelKey: 'newDeal', href: '/pipelines', icon: Briefcase, tint: 'bg-emerald-500/10 text-emerald-600' },
  { labelKey: 'newBroadcast', href: '/broadcasts/new', icon: Radio, tint: 'bg-blue-500/10 text-blue-600' },
  { labelKey: 'newAutomation', href: '/automations/new', icon: Zap, tint: 'bg-amber-500/10 text-amber-600' },
]

export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions')

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            prefetch
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <span
              className={`flex size-6 items-center justify-center rounded-full ${a.tint}`}
            >
              <Icon className="size-3.5" />
            </span>
            {t(a.labelKey as string)}
          </Link>
        )
      })}
    </div>
  )
}
