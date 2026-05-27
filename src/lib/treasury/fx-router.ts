export interface FXRate {
  fromCurrency: string
  toCurrency: string
  rate: number
  spread: number
  updatedAt: string
}

const RATES: Map<string, FXRate> = new Map()

function preRegisterRates(): void {
  const seeds: Omit<FXRate, "updatedAt">[] = [
    { fromCurrency: "USD", toCurrency: "GBP", rate: 0.79, spread: 0.015 },
    { fromCurrency: "USD", toCurrency: "EUR", rate: 0.92, spread: 0.012 },
    { fromCurrency: "USD", toCurrency: "CAD", rate: 1.36, spread: 0.010 },
    { fromCurrency: "GBP", toCurrency: "USD", rate: 1.27, spread: 0.015 },
  ]
  for (const s of seeds) {
    RATES.set(`${s.fromCurrency}:${s.toCurrency}`, { ...s, updatedAt: new Date().toISOString() })
  }
}
preRegisterRates()

export function registerFXRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number,
  spread: number,
): FXRate {
  const fx: FXRate = { fromCurrency, toCurrency, rate, spread, updatedAt: new Date().toISOString() }
  RATES.set(`${fromCurrency}:${toCurrency}`, fx)
  return fx
}

export function convert(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): { converted: number; rate: number; fee: number } {
  if (fromCurrency === toCurrency) {
    return { converted: amount, rate: 1, fee: 0 }
  }

  const direct = RATES.get(`${fromCurrency}:${toCurrency}`)
  if (direct) {
    const fee = amount * direct.spread
    const converted = (amount - fee) * direct.rate
    return { converted, rate: direct.rate, fee }
  }

  const reverse = RATES.get(`${toCurrency}:${fromCurrency}`)
  if (reverse) {
    const impliedRate = 1 / reverse.rate
    const fee = amount * reverse.spread
    const converted = (amount - fee) * impliedRate
    return { converted, rate: impliedRate, fee }
  }

  return { converted: amount, rate: 1, fee: 0 }
}

export function getRate(fromCurrency: string, toCurrency: string): FXRate | undefined {
  return RATES.get(`${fromCurrency}:${toCurrency}`)
}

export function getAllRates(): FXRate[] {
  return Array.from(RATES.values())
}
