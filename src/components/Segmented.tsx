'use client'
import { cn } from '@/lib/utils'

/** Compact pill-style segmented control. */
export function Segmented<T extends string | number>({
  options, value, onChange, size = 'sm',
}: {
  options: { value: T; label: string; title?: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'xs' | 'sm'
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-zinc-900 border border-zinc-800 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md transition-colors whitespace-nowrap',
            size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
            value === o.value ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
