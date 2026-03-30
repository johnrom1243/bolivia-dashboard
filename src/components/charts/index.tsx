'use client'
/**
 * Shared chart wrappers around Recharts.
 * All charts are dark-themed and responsive.
 */
export {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
  LineChart, Line, ReferenceLine, ReferenceArea,
  ScatterChart, Scatter, ZAxis,
  AreaChart, Area,
  PieChart, Pie,
  Treemap,
} from 'recharts'

export const CHART_THEME = {
  background: 'transparent',
  gridColor: '#27272a',
  axisColor: '#52525b',
  tooltipBg: '#18181b',
  tooltipBorder: '#3f3f46',
  text: '#a1a1aa',
}

export const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#22C55E', '#F43F5E',
  '#14B8A6', '#A78BFA', '#FB923C', '#34D399', '#60A5FA',
]
