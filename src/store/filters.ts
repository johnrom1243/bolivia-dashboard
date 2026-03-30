import { create } from 'zustand'
import { buildQuery } from '@/lib/utils'

export interface FilterState {
  yearMin: number | undefined
  yearMax: number | undefined
  months: number[]
  minerals: string[]
  supplierSearch: string
  buyerSearch: string
  excludePenfold: boolean
  onlyPenfold: boolean
  topN: number
  // Derived
  queryString: string
  setYearRange: (min: number | undefined, max: number | undefined) => void
  setMonths: (months: number[]) => void
  setMinerals: (minerals: string[]) => void
  setSupplierSearch: (s: string) => void
  setBuyerSearch: (s: string) => void
  setExcludePenfold: (v: boolean) => void
  setOnlyPenfold: (v: boolean) => void
  setTopN: (n: number) => void
  reset: () => void
}

const defaultState = {
  yearMin: undefined as number | undefined,
  yearMax: undefined as number | undefined,
  months: [] as number[],
  minerals: [] as string[],
  supplierSearch: '',
  buyerSearch: '',
  excludePenfold: false,
  onlyPenfold: false,
  topN: 15,
}

function computeQuery(s: typeof defaultState): string {
  return buildQuery({
    yearMin: s.yearMin,
    yearMax: s.yearMax,
    months: s.months,
    minerals: s.minerals,
    supplierSearch: s.supplierSearch,
    buyerSearch: s.buyerSearch,
    excludePenfold: s.excludePenfold || undefined,
    onlyPenfold: s.onlyPenfold || undefined,
    topN: s.topN !== 15 ? s.topN : undefined,
  })
}

export const useFilters = create<FilterState>((set, get) => ({
  ...defaultState,
  queryString: '',

  setYearRange: (min, max) =>
    set((s) => {
      const n = { ...s, yearMin: min, yearMax: max }
      return { ...n, queryString: computeQuery(n) }
    }),

  setMonths: (months) =>
    set((s) => {
      const n = { ...s, months }
      return { ...n, queryString: computeQuery(n) }
    }),

  setMinerals: (minerals) =>
    set((s) => {
      const n = { ...s, minerals }
      return { ...n, queryString: computeQuery(n) }
    }),

  setSupplierSearch: (supplierSearch) =>
    set((s) => {
      const n = { ...s, supplierSearch }
      return { ...n, queryString: computeQuery(n) }
    }),

  setBuyerSearch: (buyerSearch) =>
    set((s) => {
      const n = { ...s, buyerSearch }
      return { ...n, queryString: computeQuery(n) }
    }),

  setExcludePenfold: (excludePenfold) =>
    set((s) => {
      const n = { ...s, excludePenfold, onlyPenfold: excludePenfold ? false : s.onlyPenfold }
      return { ...n, queryString: computeQuery(n) }
    }),

  setOnlyPenfold: (onlyPenfold) =>
    set((s) => {
      const n = { ...s, onlyPenfold, excludePenfold: onlyPenfold ? false : s.excludePenfold }
      return { ...n, queryString: computeQuery(n) }
    }),

  setTopN: (topN) =>
    set((s) => {
      const n = { ...s, topN }
      return { ...n, queryString: computeQuery(n) }
    }),

  reset: () =>
    set({ ...defaultState, queryString: '' }),
}))
