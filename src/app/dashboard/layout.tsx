import { Sidebar } from '@/components/layout/Sidebar'
import { FilterPanel } from '@/components/layout/FilterPanel'
import { TopBar } from '@/components/layout/TopBar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Left sidebar — navigation */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 ml-56 flex flex-col min-h-screen">
        <TopBar />

        <div className="flex flex-1">
          {/* Content */}
          <main className="flex-1 min-w-0 p-6 overflow-auto">{children}</main>

          {/* Right filter panel */}
          <aside className="w-56 flex-shrink-0 border-l border-zinc-800 bg-zinc-900 overflow-y-auto">
            <div className="sticky top-0">
              <div className="px-4 py-3 border-b border-zinc-800">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Filters</h3>
              </div>
              <FilterPanel />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
