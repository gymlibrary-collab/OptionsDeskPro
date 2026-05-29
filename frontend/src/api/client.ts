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

export default api
