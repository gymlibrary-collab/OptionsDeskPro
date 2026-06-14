import axios from 'axios'

const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  'https://optionspro-backend-production.up.railway.app'

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
  price?: number
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
  strategy_key?: string
  strategy_name?: string
  profit_target_pct?: number
  entry_action?: string
}

export interface PortfolioSummary {
  cash: number
  positions_value: number
  total_value: number
  total_pnl: number
}

export interface RiskSignal {
  level: 'green' | 'yellow' | 'red'
  type: string
  msg: string
}

export interface PositionRisk {
  symbol: string
  expiry: string
  strike: number
  option_type: string
  quantity: number
  avg_cost: number
  current_price: number
  pnl: number
  strategy_key?: string
  strategy_name?: string
  profit_target_pct: number
  entry_action?: string
  dte: number
  pnl_pct: number
  risk_level: 'green' | 'yellow' | 'red'
  iv_rank?: number
  iv_environment?: string
  bias?: string
  signals: RiskSignal[]
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
  api.get<Position[]>('/positions', { timeout: 45000 }).then(r => r.data)

export const getPortfolio = () =>
  api.get<PortfolioSummary>('/portfolio', { timeout: 45000 }).then(r => r.data)

export const getPositionsRisk = (): Promise<PositionRisk[]> =>
  api.get<PositionRisk[]>('/positions/risk').then(r => r.data)

// ─── Strategy Intelligence ──────────────────────────────────────────────────────

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
  fit_score?: number
  trade?: TradeStructure
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
  expiry?: string
}

export interface Narrative {
  headline: string
  market_snapshot: string
  iv_context: string
  why_this_strategy: string
  trade_plain_english: string
  profit_scenario: string
  loss_scenario: string
  defensive_tactic: string
  trade_ticket?: string
  execution_checklist: string[]
  confirmation_summary: string
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
  narrative?: Narrative
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

export interface NewsSentiment {
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: number
  digest: string
}

export interface AIRecommendation {
  recommended_key: string
  recommended_name: string
  reasoning: string
}

export interface AnalyzeSymbolResponse {
  symbol: string
  iv_analysis: IVAnalysis
  bias_analysis: BiasAnalysis
  detected_bias: string
  recommendations_by_category: Record<string, StrategyRecommendation[]>
  news_sentiment?: NewsSentiment
  ai_recommendation?: AIRecommendation
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
  scan_narrative?: { headline: string; confirmation_summary: string } | null
  error?: string
}

export const analyzeSymbol = (symbol: string): Promise<AnalyzeSymbolResponse> =>
  api.get(`/strategies/analyze/${symbol}`).then(r => r.data)

export const scanWatchlist = (symbols: string): Promise<ScanResult[]> =>
  api.get(`/strategies/scan`, { params: { symbols }, timeout: 60000 }).then(r => r.data)

export const getBrokerAccount = () =>
  api.get('/broker/account').then(r => r.data)

export const getPnLHistory = () =>
  api.get('/auth/pnl-history').then(r => r.data)

// ─── Trading Desk — Reddit buzz ───────────────────────────────────────────────────────────

export interface RedditPost {
  title: string
  subreddit: string
  score: number
  num_comments: number
  url: string
  flair: string
  created_utc: number
}

export const getEarningsBuzz   = (): Promise<RedditPost[]> => api.get('/trading/buzz/earnings').then(r => r.data)
export const getStocksBuzz     = (): Promise<RedditPost[]> => api.get('/trading/buzz/stocks').then(r => r.data)
export const getCryptoBuzz     = (): Promise<RedditPost[]> => api.get('/trading/buzz/crypto').then(r => r.data)
export const getTokensBuzz     = (): Promise<RedditPost[]> => api.get('/trading/buzz/tokens').then(r => r.data)
export const getSelectedBuzz   = (symbols: string): Promise<RedditPost[]> =>
  api.get(`/trading/buzz/selected?symbols=${encodeURIComponent(symbols)}`).then(r => r.data)

// ─── Stock Orders ──────────────────────────────────────────────────────────────────────────────

export interface StockOrderRequest {
  symbol: string
  action: 'buy' | 'sell'
  quantity: number
  order_type: 'market' | 'limit'
  limit_price?: number
}

export interface StockOrder {
  id: string
  timestamp: string
  symbol: string
  action: string
  quantity: number
  order_type: string
  limit_price?: number
  fill_price: number
  total_value: number
  status: string
}

export const placeStockOrder = (order: StockOrderRequest): Promise<StockOrder> =>
  api.post<StockOrder>('/stock-orders', order).then(r => r.data)

export const getStockOrders = (): Promise<StockOrder[]> =>
  api.get<StockOrder[]>('/stock-orders').then(r => r.data)

// ─── Trade Recording (real trades for monitoring) ────────────────────────────────────────────────

export interface TradeLegRecord {
  role: string
  option_type: string
  strike: number
  action: string
  quantity: number
  price: number
}

export interface TradeRecordRequest {
  symbol: string
  strategy_key: string
  strategy_name: string
  expiry: string
  profit_target_pct: number
  legs: TradeLegRecord[]
}

export const recordTrade = (req: TradeRecordRequest): Promise<{ recorded: number; strategy: string }> =>
  api.post('/trades/record', req).then(r => r.data)

// ─── AI Features ────────────────────────────────────────────────────────────────────────────────────

export interface AISettings {
  narrative_enabled: boolean
  chat_enabled: boolean
  risk_summary_enabled: boolean
  strategy_reasoning_enabled: boolean
  earnings_awareness_enabled: boolean
}

export const getAISettings = (): Promise<AISettings> =>
  api.get('/ai/settings').then(r => r.data)

export const updateAISettings = (settings: Partial<AISettings>): Promise<{ saved: boolean }> =>
  api.put('/ai/settings', settings).then(r => r.data)

export const aiChat = (question: string): Promise<{ answer: string }> =>
  api.post('/ai/chat', { question }, { timeout: 30000 }).then(r => r.data)

export const aiRiskSummary = (positions_risk: object[]): Promise<{ summary: string | null }> =>
  api.post('/ai/risk-summary', { positions_risk }, { timeout: 30000 }).then(r => r.data)

export const aiStrategyReasoning = (
  symbol: string, iv_analysis: object, bias_analysis: object, strategy: object, trade: object
): Promise<{ reasoning: string | null }> =>
  api.post('/ai/strategy-reasoning', { symbol, iv_analysis, bias_analysis, strategy, trade }, { timeout: 30000 }).then(r => r.data)

export const aiEnhanceNarrative = (
  symbol: string, iv_analysis: object, bias_analysis: object, strategy: object, trade: object
): Promise<{ insight: string | null }> =>
  api.post('/ai/enhance-narrative', { symbol, iv_analysis, bias_analysis, strategy, trade }, { timeout: 30000 }).then(r => r.data)

export interface MorningBriefingResponse {
  briefing: string
  date: string
  symbols: string[]
  cached: boolean
}

export const getMorningBriefing = (): Promise<MorningBriefingResponse> =>
  api.get('/ai/morning-briefing', { timeout: 30000 }).then(r => r.data)

export interface TradeJournalReview {
  entry_consistency: string
  rule_adherence: string
  behavioural_patterns: string
  overall_grade: string
}

export const getTradeJournalReview = (orderId: string): Promise<TradeJournalReview> =>
  api.post('/ai/trade-journal/review', { order_id: orderId }, { timeout: 30000 }).then(r => r.data)

export interface RollAdvisorSuggestion {
  action: string
  rationale: string
  urgency: string
}

export interface RollAdvisorResponse {
  suggestions: RollAdvisorSuggestion[]
  summary: string
}

export const getRollAdvisor = (positionId: string): Promise<RollAdvisorResponse> =>
  api.post('/ai/roll-advisor', { position_id: positionId }, { timeout: 30000 }).then(r => r.data)

export interface GreeksCoachingResponse {
  coaching: string
  net_delta: number
  net_theta: number
  net_vega: number
}

export const getGreeksCoaching = (): Promise<GreeksCoachingResponse> =>
  api.post('/ai/portfolio-greeks-coaching', {}, { timeout: 30000 }).then(r => r.data)

// ─── Watchlist ───────────────────────────────────────────────────────────────────────────────────────

export interface WatchlistState {
  symbols: string[]
  tier: string
  max_symbols: number | null
  scans_used: number
  max_scans_per_month: number | null
}

export const getWatchlist = (): Promise<WatchlistState> =>
  api.get('/watchlist').then(r => r.data)

export const saveWatchlist = (symbols: string[]): Promise<{ saved: number; tier: string }> =>
  api.put('/watchlist', { symbols }).then(r => r.data)

// ─── Entitlements ────────────────────────────────────────────────────────────────────────────────

export interface EntitlementFeatures {
  trading_desk: boolean
  positions: boolean
  risk_monitor: boolean
  ai_narrative?: boolean
  ai_chat?: boolean
  ai_risk_summary?: boolean
  ai_strategy_reasoning?: boolean
  ai_earnings_awareness?: boolean
  trade_journal?: boolean
  roll_advisor?: boolean
  greeks_coaching?: boolean
  [key: string]: boolean | undefined
}

export interface Entitlements {
  effective_tier: string
  subscription_status: string
  stripe_tier: string
  admin_override_tier: string | null
  max_symbols: number | null
  max_scans_per_month: number | null
  features: EntitlementFeatures
  current_period_end: string | null
  cancel_at_period_end: boolean
  pending_tier_key: string | null
  payment_failed: boolean
  // From plans catalog (F-012)
  display_name?: string
  price_monthly_usd?: number
}

export const getEntitlements = (): Promise<Entitlements> =>
  api.get('/auth/entitlements').then(r => r.data)

// ─── Public routes ───────────────────────────────────────────────────────────────────────────────

export interface PlanFeatures {
  trading_desk: boolean
  positions: boolean
  risk_monitor: boolean
  [key: string]: boolean
}

export interface Plan {
  tier_key: string
  display_name: string
  price_monthly_usd: number
  max_symbols: number | null
  max_scans_per_month: number | null
  features: PlanFeatures
  contact_us?: boolean
}

export interface PublicPricingResponse {
  plans: Plan[]
}

export interface FaqArticle {
  id: string
  question: string
  answer_markdown: string
  sort_order: number
  is_published?: boolean
}

export interface FaqCategory {
  id: string
  title: string
  articles: FaqArticle[]
}

export interface PublicFaqResponse {
  categories: FaqCategory[]
}

export const getPublicPricing = (): Promise<PublicPricingResponse> =>
  api.get('/public/pricing').then(r => r.data)

export const getPublicFaq = (): Promise<PublicFaqResponse> =>
  api.get('/public/faq').then(r => r.data)

// ─── Billing routes ──────────────────────────────────────────────────────────────────────────────

export interface CheckoutSessionRequest {
  tier_key: string
}

export interface CheckoutSessionResponse {
  checkout_url: string
}

export interface UpgradeResponse {
  ok: boolean
  effective_tier: string
  current_period_end: string
}

export interface DowngradeResponse {
  ok: boolean
  pending_tier_key: string
  effective_until: string
}

export interface CancelResponse {
  ok: boolean
  cancels_at: string
}

export interface Invoice {
  id: string
  stripe_invoice_id: string
  amount_paid: number
  currency: string
  status: string
  description: string | null
  period_start: string | null
  period_end: string | null
  invoice_pdf: string | null
  created_at: string
}

export interface InvoicesResponse {
  invoices: Invoice[]
}

export interface PaymentMethod {
  brand: string | null
  last4: string | null
  exp_month: number | null
  exp_year: number | null
  stale?: boolean
}

export interface PortalResponse {
  portal_url: string
}

export const createCheckoutSession = (req: CheckoutSessionRequest): Promise<CheckoutSessionResponse> =>
  api.post('/billing/checkout-session', req).then(r => r.data)

export const upgradePlan = (tier_key: string): Promise<UpgradeResponse> =>
  api.post('/billing/upgrade', { tier_key }).then(r => r.data)

export const downgradePlan = (tier_key: string): Promise<DowngradeResponse> =>
  api.post('/billing/downgrade', { tier_key }).then(r => r.data)

export const cancelSubscription = (confirmation: string): Promise<CancelResponse> =>
  api.post('/billing/cancel', { confirmation }).then(r => r.data)

export const reactivateSubscription = (): Promise<{ ok: boolean }> =>
  api.post('/billing/reactivate', {}).then(r => r.data)

export const getBillingInvoices = (): Promise<InvoicesResponse> =>
  api.get('/billing/invoices').then(r => r.data)

export const getPaymentMethod = (): Promise<PaymentMethod> =>
  api.get('/billing/payment-method').then(r => r.data)

export const createBillingPortalSession = (): Promise<PortalResponse> =>
  api.post('/billing/portal', {}).then(r => r.data)

export const deleteAccount = (confirmation: string): Promise<{ ok: boolean }> =>
  api.delete('/auth/account', { data: { confirmation } }).then(r => r.data)

// ─── Platform (admin) routes ─────────────────────────────────────────────────────────────────────

export interface StaffMember {
  id: string
  email: string
  full_name: string | null
  staff_role: 'owner' | 'support' | 'finance'
  is_active: boolean
  last_seen_at: string | null
  created_at: string
}

export interface StaffMeResponse {
  id: string
  email: string
  full_name: string | null
  staff_role: 'owner' | 'support' | 'finance'
  is_active: boolean
}

export interface SubscriberRow {
  id: string
  email: string
  full_name: string | null
  tier_key: string
  subscription_status: string
  stripe_customer_id: string | null
  created_at: string
  last_seen_at: string | null
  is_active: boolean
}

export interface SubscriberListResponse {
  total: number
  page: number
  page_size: number
  subscribers: SubscriberRow[]
}

export interface SubscriberPosition {
  symbol: string
  quantity: number
  avg_cost: number
  strategy: string | null
  opened_at: string | null
}

export interface SubscriberOrder {
  id: string
  timestamp: string
  symbol: string
  action: string
  quantity: number
  price: number
  status: string
}

export interface SubscriberActivityEntry {
  id: string
  action: string
  created_at: string
  details: string | null
}

export interface SubscriberDetailResponse {
  profile: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
    created_at: string
    last_seen_at: string | null
    onboarding_completed: boolean
    is_active: boolean
  }
  subscription: {
    tier_key: string
    status: string
    current_period_end: string | null
    cancel_at_period_end: boolean
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
  }
  positions_count: number
  orders_count: number
  invoices: Invoice[]
  // Support view fields (returned by GET /api/platform/subscribers/{user_id})
  watchlist_symbols?: string[]
  positions?: SubscriberPosition[]
  orders?: SubscriberOrder[]
  recent_activity?: SubscriberActivityEntry[]
}

export interface SupportSessionResponse {
  support_session_id: string
  subscriber_id: string
  subscriber_email: string
  started_at: string
}

export interface PlatformPlan extends Plan {
  stripe_price_id: string | null
  stripe_product_id: string | null
  is_active: boolean
  sort_order: number
}

export interface PlatformPricingResponse {
  plans: PlatformPlan[]
}

export interface PricingPatchRequest {
  price_monthly_usd?: number
  max_symbols?: number | null
  max_scans_per_month?: number | null
  features_json?: PlanFeatures
}

export interface PricingPatchResponse {
  ok: boolean
  affected_subscriber_count: number
  new_stripe_price_id: string | null
}

export interface RevenueMetrics {
  mrr_current_usd: number
  mrr_by_month: { month: string; mrr_usd: number }[]
  active_subscribers_by_tier: Record<string, number>
  new_this_month: number
  churned_this_month: number
  past_due_count: number
  past_due_amount_at_risk_usd: number
}

export interface HealthData {
  api_status: string
  market_data_credits: {
    date: string
    calls_today: number
    limit: number
    pct: number
    alert_level: 'ok' | 'warning' | 'critical'
  }
  requests_last_24h: Record<string, number>
  active_sessions_last_15min: number
}

export interface PlatformSettings {
  invite_only_mode: boolean
  maintenance_mode: boolean
}

export const getStaffMe = (): Promise<StaffMeResponse> =>
  api.get('/platform/staff/me').then(r => r.data)

export const getSubscribers = (params: {
  page?: number
  page_size?: number
  search?: string
  tier_key?: string
  status?: string
}): Promise<SubscriberListResponse> =>
  api.get('/platform/subscribers', { params }).then(r => r.data)

export const getSubscriberDetail = (userId: string): Promise<SubscriberDetailResponse> =>
  api.get(`/platform/subscribers/${userId}`).then(r => r.data)

export const startSupportSession = (userId: string): Promise<SupportSessionResponse> =>
  api.post(`/platform/subscribers/${userId}/support-session`, {}).then(r => r.data)

export const endSupportSession = (userId: string): Promise<{ ok: boolean }> =>
  api.delete(`/platform/subscribers/${userId}/support-session`).then(r => r.data)

export const tierOverride = (userId: string, tier_key: string | null, reason: string): Promise<{ ok: boolean; admin_override_tier_key: string | null }> =>
  api.patch(`/platform/subscribers/${userId}/tier-override`, { tier_key, reason }).then(r => r.data)

export const deactivateSubscriber = (userId: string): Promise<{ ok: boolean }> =>
  api.patch(`/platform/subscribers/${userId}/deactivate`).then(r => r.data)

export const reactivateSubscriber = (userId: string): Promise<{ ok: boolean }> =>
  api.patch(`/platform/subscribers/${userId}/reactivate`).then(r => r.data)

export const getPlatformPricing = (): Promise<PlatformPricingResponse> =>
  api.get('/platform/pricing').then(r => r.data)

export const patchPlatformPricing = (tierKey: string, req: PricingPatchRequest): Promise<PricingPatchResponse> =>
  api.patch(`/platform/pricing/${tierKey}`, req).then(r => r.data)

export const getRevenueMetrics = (): Promise<RevenueMetrics> =>
  api.get('/platform/revenue').then(r => r.data)

export const exportRevenueCsv = (fromDate: string, toDate: string): Promise<Blob> =>
  api.get('/platform/revenue/export-csv', {
    params: { from_date: fromDate, to_date: toDate },
    responseType: 'blob',
  }).then(r => r.data as Blob)

export const getHealthData = (): Promise<HealthData> =>
  api.get('/platform/health').then(r => r.data)

export const getStaffList = (): Promise<{ staff: StaffMember[] }> =>
  api.get('/platform/staff').then(r => r.data)

export const inviteStaff = (req: { email: string; staff_role: string; full_name: string }): Promise<{ ok: boolean; email: string }> =>
  api.post('/platform/staff/invite', req).then(r => r.data)

export const changeStaffRole = (staffId: string, staff_role: string): Promise<{ ok: boolean }> =>
  api.patch(`/platform/staff/${staffId}/role`, { staff_role }).then(r => r.data)

export const deactivateStaff = (staffId: string): Promise<{ ok: boolean }> =>
  api.patch(`/platform/staff/${staffId}/deactivate`).then(r => r.data)

export const getPlatformFaq = (): Promise<PublicFaqResponse> =>
  api.get('/platform/faq').then(r => r.data)

export const createFaqArticle = (req: {
  category_id: string | null
  question: string
  answer_markdown: string
  sort_order: number
}): Promise<{ id: string; is_published: boolean }> =>
  api.post('/platform/faq', req).then(r => r.data)

export const updateFaqArticle = (articleId: string, req: Partial<{
  question: string
  answer_markdown: string
  sort_order: number
  category_id: string | null
}>): Promise<{ ok: boolean }> =>
  api.patch(`/platform/faq/${articleId}`, req).then(r => r.data)

export const publishFaqArticle = (articleId: string, is_published: boolean): Promise<{ ok: boolean }> =>
  api.post(`/platform/faq/${articleId}/publish`, { is_published }).then(r => r.data)

export const deleteFaqArticle = (articleId: string): Promise<{ ok: boolean }> =>
  api.delete(`/platform/faq/${articleId}`).then(r => r.data)

export const getPlatformSettings = (): Promise<PlatformSettings> =>
  api.get('/platform/settings').then(r => r.data)

export const patchPlatformSettings = (req: Partial<PlatformSettings>): Promise<{ ok: boolean }> =>
  api.patch('/platform/settings', req).then(r => r.data)

// ─── Legal Terms Acknowledgment ──────────────────────────────────────────────

export interface LegalVersion {
  id: string
  version_number: string
  title: string
  content_markdown: string
  content_hash: string
  effective_date: string
  published_at: string
  is_active?: boolean
  published_by?: string
}

export interface AcknowledgeRequest {
  version_id: string
  content_hash: string
}

export interface AcknowledgeResponse {
  acknowledged: boolean
  version_number: string
  acknowledged_at?: string
  already_acknowledged?: boolean
}

export interface LegalAcknowledgmentHistory {
  id: string
  version_number: string
  title: string
  effective_date: string
  content_hash: string
  acknowledged_at: string
  ip_address: string | null
}

// Subscriber (auth required)
export const getLegalCurrentVersion = (): Promise<LegalVersion> =>
  api.get('/legal/current-version').then(r => r.data)

export const postLegalAcknowledge = (body: AcknowledgeRequest): Promise<AcknowledgeResponse> =>
  api.post('/legal/acknowledge', body).then(r => r.data)

// Admin/staff routes
export const getPlatformLegalVersions = (): Promise<{ versions: LegalVersion[] }> =>
  api.get('/platform/legal/versions').then(r => r.data)

export const postPlatformLegalVersion = (body: {
  version_number: string
  title: string
  content_markdown: string
  effective_date: string
}): Promise<{ id: string; version_number: string; content_hash: string }> =>
  api.post('/platform/legal/versions', body).then(r => r.data)

export const getSubscriberLegalHistory = (userId: string): Promise<{ history: LegalAcknowledgmentHistory[] }> =>
  api.get(`/platform/legal/subscribers/${userId}/history`).then(r => r.data)

export const getPlatformLegalPendingCount = (): Promise<{ pending_count: number; current_version_number: string | null }> =>
  api.get('/platform/legal/pending-count').then(r => r.data)

export default api
