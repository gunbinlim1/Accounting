const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const formatCurrency = (value: number): string => usd.format(value)

export const formatCurrencyWhole = (value: number): string => usdWhole.format(value)

export const formatPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`

export const formatSigned = (value: number): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${usd.format(Math.abs(value))}`

export const formatDate = (d: Date, locale: string, opts?: Intl.DateTimeFormatOptions): string =>
  d.toLocaleDateString(locale, opts ?? { month: 'long', day: 'numeric', weekday: 'short' })

export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
