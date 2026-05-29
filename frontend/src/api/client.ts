import axios from 'axios'

const BACKEND_URL = 'https://options-backend-production-28c6.up.railway.app'

const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 15000,
})

export interface Quote {
  symbol: string
  price: number
  previousClose: number
  change: number
  changePercent: number
  volume: number
  marketCap: number
}

export interface OptionContract {
  contractSymbol: string
  strike: number
  lastPrice: number
  bid: number
  ask: number
  change: number
  percentChange: number
  volume: number
  openInterest: number
  impliedVolatility: number
  inTheMoney: boolean
  delta: number
  gamma: number
  theta: number
  vega: number
}

export interface OptionsChainResponse {
  symbol: string
  quote: Quote
  expiry: string
  expirations: string[]
  calls: OptionContract[]
  puts: OptionContract[]
}

export interface OrderRequest {
  symbol: string
  expiry: string
  strike: number
  option_type: string
  action: string
  quantity: number
}

export interface Order {
  id: string
  timestamp: string
  symbol: string
  expiry: string
  strike: number
  option_type: string
  action: string
  quantity: number
  price: number
  status: string
}

export interface Position {
  symbol: string
  expiry: string
  strike: number
  option_type: string
  quantity: number
  avg_cost: number
  current_price: number
  pnl: number
  delta: number
  gamma: number
}

export interface PortfolioSummary {
  cash: number
  positions_value: number
  total_value: number
  total_pnl: number
}

export const getQuote = (symbol: string) =>
  api.get<Quote>(`/options/quote/${symbol}`).then(r => r.data)

export const getOptionsChain = (symbol: string, expiry?: string) =>
  api.get<OptionsChainResponse>(`/options/chain/${symbol}`, {
    params: expiry ? { expiry } : {},
  }).then(r => r.data)

export const placeOrder = (order: OrderRequest) =>
  api.post<Order>('/orders', order).then(r => r.data)

export const getOrders = () =>
  api.get<Order[]>('/orders').then(r => r.data)

export const getPositions = () =>
  api.get<Position[]>('/positions').then(r => r.data)

export const getPortfolio = () =>
  api.get<PortfolioSummary>('/portfolio').then(r => r.data)

// ─── Strategy Intelligence ──────────────────────────────────────────────────

export interface StrategyRecommendation {
  key: string
  name: string
  description: string
  direction: string[]
  iv_environment: string[]
  risk_type: string
  complexity: number
  dte_target: number
  pop_range: [number, number]
  profit_target_pct: number
  fit_score: number
}

export interface TradeLeg {
  role: string
  option_type: string
  strike: number
  delta: number
  bid: number
  ask: number
  mid: number
  action: string
}

export interface TradeStructure {
  strategy: string
  strategy_key: string
  expiry: string
  legs: TradeLeg[]
  max_profit: number | null
  max_loss: number | null
  estimated_credit_or_debit: number
  pop_estimate: number | null
  breakeven_low: number | null
  breakeven_high: number | null
  tastylive_profit_target: number | null
  risk_type: string
  profit_target_pct: number
  error?: string
}

export interface IVAnalysis {
  symbol: string
  current_iv: number
  iv_rank: number
  hv_30d: number
  hv_52wk_high: number
  hv_52wk_low: number
  iv_environment: string
  percentile_label: string
  error?: string
}

export interface BiasAnalysis {
  symbol: string
  price: number
  sma20: number
  sma50: number
  rsi14: number
  bias: string
  strength: string
  error?: string
}

export interface AnalyzeSymbolResponse {
  symbol: string
  iv_analysis: IVAnalysis
  bias_analysis: BiasAnalysis
  recommendations: StrategyRecommendation[]
  trades: { strategy_key: string; strategy_name: string; trade: TradeStructure }[]
}

export interface ScanResult {
  symbol: string
  price: number
  iv_rank: number
  current_iv: number
  iv_environment: string
  percentile_label: string
  bias: string
  bias_strength: string
  rsi14: number
  top_strategy: StrategyRecommendation | null
  error?: string
}

export const analyzeSymbol = (symbol: string): Promise<AnalyzeSymbolResponse> =>
  api.get(`/strategies/analyze/${symbol}`).then(r => r.data)

export const scanWatchlist = (symbols: string): Promise<ScanResult[]> =>
  api.get(`/strategies/scan`, { params: { symbols } }).then(r => r.data)

export const getBrokerAccount = () =>
  api.get('/broker/account').then(r => r.data)

export default api
