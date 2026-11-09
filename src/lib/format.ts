const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const formatCurrency = (value: number): string => usd.format(value)

export const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`
