'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ExportButtonProps {
  url: string
  filename?: string
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export function ExportButton({ url, filename, label = 'Export Excel', size = 'sm', className }: ExportButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = filename ?? 'export.xlsx'
      a.click()
      URL.revokeObjectURL(href)
    } catch (e) {
      console.error('Export error:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-lg transition-all',
        'bg-zinc-800 border border-zinc-700 text-zinc-300',
        'hover:bg-zinc-700 hover:text-white hover:border-zinc-600',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        className,
      )}
    >
      {loading ? (
        <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      )}
      {loading ? 'Exporting…' : label}
    </button>
  )
}
