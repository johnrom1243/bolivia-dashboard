'use client'
import { useFilters } from '@/store/filters'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function FilterPanel() {
  const f = useFilters()

  // Fetch distinct minerals + year range from a lightweight meta endpoint
  const { data: meta } = useQuery<{ minerals: string[]; yearMin: number; yearMax: number }>({
    queryKey: ['meta'],
    queryFn: () => fetch('/api/data/meta').then((r) => r.json()),
    staleTime: Infinity,
  })

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      {/* Year range */}
      <Section title="Year Range">
        <div className="flex gap-2">
          <input
            type="number"
            className={inputCls}
            placeholder={String(meta?.yearMin ?? 'From')}
            value={f.yearMin ?? ''}
            onChange={(e) => f.setYearRange(e.target.value ? Number(e.target.value) : undefined, f.yearMax)}
          />
          <span className="text-zinc-500 self-center">–</span>
          <input
            type="number"
            className={inputCls}
            placeholder={String(meta?.yearMax ?? 'To')}
            value={f.yearMax ?? ''}
            onChange={(e) => f.setYearRange(f.yearMin, e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      </Section>

      {/* Months */}
      <Section title="Months">
        <div className="grid grid-cols-4 gap-1">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => {
                const idx = i + 1
                f.setMonths(
                  f.months.includes(idx) ? f.months.filter((x) => x !== idx) : [...f.months, idx],
                )
              }}
              className={cn(
                'px-1 py-1 rounded text-xs transition-all',
                f.months.includes(i + 1)
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        {f.months.length > 0 && (
          <button className="text-xs text-zinc-500 hover:text-white mt-1" onClick={() => f.setMonths([])}>
            Clear months
          </button>
        )}
      </Section>

      {/* Minerals */}
      {meta?.minerals?.length ? (
        <Section title="Minerals">
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {meta.minerals.map((min) => (
              <label key={min} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={f.minerals.includes(min)}
                  onChange={(e) => {
                    f.setMinerals(
                      e.target.checked
                        ? [...f.minerals, min]
                        : f.minerals.filter((m) => m !== min),
                    )
                  }}
                  className="rounded border-zinc-600 bg-zinc-800 text-blue-600 cursor-pointer"
                />
                <span className="text-zinc-400 group-hover:text-white transition-colors text-xs">{min}</span>
              </label>
            ))}
          </div>
          {f.minerals.length > 0 && (
            <button className="text-xs text-zinc-500 hover:text-white mt-1" onClick={() => f.setMinerals([])}>
              Clear minerals
            </button>
          )}
        </Section>
      ) : null}

      {/* Supplier search */}
      <Section title="Supplier">
        <input
          type="text"
          className={inputCls}
          placeholder="Filter by supplier name…"
          value={f.supplierSearch}
          onChange={(e) => f.setSupplierSearch(e.target.value)}
        />
      </Section>

      {/* Buyer search */}
      <Section title="Buyer / Trader">
        <input
          type="text"
          className={inputCls}
          placeholder="Filter by buyer name…"
          value={f.buyerSearch}
          onChange={(e) => f.setBuyerSearch(e.target.value)}
        />
      </Section>

      {/* Penfold filter */}
      <Section title="Penfold Filter">
        <div className="flex flex-col gap-1.5">
          {[
            { label: 'All buyers', val: 'all' },
            { label: 'Only Penfold', val: 'only' },
            { label: 'Exclude Penfold', val: 'exclude' },
          ].map(({ label, val }) => (
            <label key={val} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="penfold"
                checked={
                  val === 'only'
                    ? f.onlyPenfold
                    : val === 'exclude'
                    ? f.excludePenfold
                    : !f.onlyPenfold && !f.excludePenfold
                }
                onChange={() => {
                  if (val === 'only') { f.setOnlyPenfold(true); f.setExcludePenfold(false) }
                  else if (val === 'exclude') { f.setExcludePenfold(true); f.setOnlyPenfold(false) }
                  else { f.setOnlyPenfold(false); f.setExcludePenfold(false) }
                }}
                className="text-blue-600"
              />
              <span className="text-zinc-400 group-hover:text-white transition-colors text-xs">{label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Top N */}
      <Section title={`Top N: ${f.topN}`}>
        <input
          type="range"
          min={3}
          max={30}
          value={f.topN}
          onChange={(e) => f.setTopN(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-zinc-600 text-xs mt-0.5">
          <span>3</span><span>30</span>
        </div>
      </Section>

      {/* Reset */}
      <button
        onClick={f.reset}
        className="mt-2 w-full py-2 rounded-lg border border-zinc-700 text-zinc-400
                   hover:text-white hover:border-zinc-500 hover:bg-zinc-800
                   text-xs font-medium transition-all"
      >
        Reset all filters
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{title}</div>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white ' +
  'placeholder-zinc-500 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ' +
  'focus:border-transparent transition-all'
