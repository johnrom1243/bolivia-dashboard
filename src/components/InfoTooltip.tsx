'use client'
import * as Tooltip from '@radix-ui/react-tooltip'

interface InfoTooltipProps {
  /** Short title shown in bold */
  term: string
  /** What the metric means */
  what: string
  /** How it is calculated (optional) */
  calc?: string
}

export function InfoTooltip({ term, what, calc }: InfoTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-zinc-600 text-zinc-500 hover:text-zinc-300 hover:border-zinc-400 transition-colors cursor-help ml-1 flex-shrink-0 text-[9px] font-bold leading-none"
            aria-label={`Info: ${term}`}
          >
            i
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={6}
            className="z-50 max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 shadow-xl text-left"
          >
            <p className="text-xs font-semibold text-white mb-1">{term}</p>
            <p className="text-xs text-zinc-400 leading-relaxed">{what}</p>
            {calc && (
              <p className="text-xs text-zinc-500 mt-1.5 pt-1.5 border-t border-zinc-800 leading-relaxed">
                <span className="text-zinc-600 font-medium">Formula: </span>{calc}
              </p>
            )}
            <Tooltip.Arrow className="fill-zinc-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
