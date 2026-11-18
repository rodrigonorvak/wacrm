import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType, CSSProperties } from 'react'
import { cn } from '@/lib/utils'

/**
 * Each metric gets its own accent so the row reads as four distinct
 * numbers instead of four identical white boxes. `primary` follows the
 * active theme (magenta by default); the others are fixed hues that sit
 * well next to it.
 */
export type MetricTone = 'primary' | 'blue' | 'emerald' | 'amber'

const TONES: Record<MetricTone, { color: string; icon: string }> = {
  primary: {
    color: 'var(--primary)',
    icon: 'bg-primary/10 text-primary',
  },
  blue: {
    color: '#3b82f6',
    icon: 'bg-blue-500/10 text-blue-600',
  },
  emerald: {
    color: '#10b981',
    icon: 'bg-emerald-500/10 text-emerald-600',
  },
  amber: {
    color: '#f59e0b',
    icon: 'bg-amber-500/10 text-amber-600',
  },
}

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /** Accent for the icon tile and the left stripe. Defaults to the theme color. */
  tone?: MetricTone
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  tone = 'primary',
  delta,
  subtitle,
}: MetricCardProps) {
  const t = TONES[tone]
  return (
    <div
      className="dash-panel dash-metric px-5 py-4 pl-6"
      style={{ '--metric-tone': t.color } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            t.icon,
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2.5 text-2xl leading-none font-semibold tabular-nums tracking-tight text-foreground sm:text-[1.75rem]">
        {value}
      </p>
      {delta ? (
        <DeltaRow sign={delta.sign} label={delta.label} />
      ) : subtitle ? (
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  )
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'text-emerald-600'
      : sign < 0
      ? 'text-red-500'
      : 'text-muted-foreground'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <div className={cn('mt-2 flex items-center gap-1 text-xs font-medium', tone)}>
      <Arrow className="size-3.5" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  )
}
