// Shared realistic mock responses for all OptionsDesk API endpoints.
// Import these in spec files via the authedPage fixture's route interceptors.

export const MOCK_USER = {
  id: 'test-user-id-00000000',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User', avatar_url: '' },
  app_metadata: { role: 'user' },
}

export const MOCK_ADMIN_USER = {
  ...MOCK_USER,
  email: 'leonard.simgt@gmail.com',
  app_metadata: { role: 'admin' },
}

export const MOCK_SUPABASE_SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: MOCK_USER,
}

export const MOCK_QUOTE = {
  symbol: 'AAPL',
  price: 185.5,
  previousClose: 183.0,
  change: 2.5,
  changePercent: 1.37,
  volume: 52_340_000,
  marketCap: 2_890_000_000_000,
}

export const MOCK_OPTION_CONTRACT = {
  contractSymbol: 'AAPL240119C00185000',
  strike: 185,
  lastPrice: 4.2,
  bid: 4.1,
  ask: 4.3,
  change: 0.3,
  percentChange: 7.7,
  volume: 1240,
  openInterest: 8900,
  impliedVolatility: 0.28,
  inTheMoney: true,
  delta: 0.52,
  gamma: 0.04,
  theta: -0.08,
  vega: 0.15,
}

export const MOCK_OPTIONS_CHAIN = {
  symbol: 'AAPL',
  quote: MOCK_QUOTE,
  expiry: '2024-01-19',
  expirations: ['2024-01-19', '2024-02-16', '2024-03-15'],
  calls: [
    { ...MOCK_OPTION_CONTRACT, strike: 180, inTheMoney: true, delta: 0.68 },
    { ...MOCK_OPTION_CONTRACT, strike: 185, inTheMoney: true, delta: 0.52 },
    { ...MOCK_OPTION_CONTRACT, strike: 190, inTheMoney: false, delta: 0.35 },
  ],
  puts: [
    { ...MOCK_OPTION_CONTRACT, strike: 180, inTheMoney: false, delta: -0.32, contractSymbol: 'AAPL240119P00180000' },
    { ...MOCK_OPTION_CONTRACT, strike: 185, inTheMoney: false, delta: -0.48, contractSymbol: 'AAPL240119P00185000' },
    { ...MOCK_OPTION_CONTRACT, strike: 190, inTheMoney: true, delta: -0.65, contractSymbol: 'AAPL240119P00190000' },
  ],
}

export const MOCK_IV_ANALYSIS = {
  symbol: 'AAPL',
  current_iv: 0.28,
  iv_rank: 42,
  hv_30d: 0.22,
  hv_52wk_high: 0.45,
  hv_52wk_low: 0.18,
  iv_environment: 'MEDIUM',
  percentile_label: 'Normal',
  error: null,
}

export const MOCK_BIAS_ANALYSIS = {
  symbol: 'AAPL',
  price: 185.5,
  sma20: 182.3,
  sma50: 178.6,
  rsi14: 58.4,
  bias: 'BULLISH',
  strength: 'MODERATE',
  error: null,
}

export const MOCK_STRATEGY_RECOMMENDATION = {
  key: 'bull_call_spread',
  name: 'Bull Call Spread',
  description: 'Buy a lower-strike call, sell a higher-strike call. Defined risk, defined reward.',
  direction: ['BULLISH'],
  iv_environment: ['MEDIUM', 'LOW'],
  risk_type: 'defined',
  complexity: 'intermediate',
  dte_target: '30-45 DTE',
  pop_range: '45-55%',
  profit_target_pct: 50,
  fit_score: 0.87,
  trade: null,
}

export const MOCK_ANALYZE_RESPONSE = {
  symbol: 'AAPL',
  iv_analysis: MOCK_IV_ANALYSIS,
  bias_analysis: MOCK_BIAS_ANALYSIS,
  detected_bias: 'BULLISH',
  recommendations_by_category: {
    top_picks: [MOCK_STRATEGY_RECOMMENDATION],
    defined_risk: [MOCK_STRATEGY_RECOMMENDATION],
    income: [],
    speculation: [],
  },
}

export const MOCK_SCAN_RESULT = {
  symbol: 'AAPL',
  price: 185.5,
  iv_rank: 42,
  current_iv: 0.28,
  iv_environment: 'MEDIUM',
  percentile_label: 'Normal',
  bias: 'BULLISH',
  bias_strength: 'MODERATE',
  rsi14: 58.4,
  top_strategy: 'Bull Call Spread',
  scan_narrative: 'AAPL shows moderate IV with a bullish bias. Consider debit spreads.',
  error: null,
}

export const MOCK_POSITION = {
  id: 'pos-001',
  symbol: 'AAPL',
  expiry: '2024-01-19',
  strike: 185,
  option_type: 'call',
  quantity: 1,
  avg_cost: 4.2,
  current_price: 5.1,
  pnl: 90,
  delta: 0.52,
  gamma: 0.04,
  strategy_key: 'long_call',
  strategy_name: 'Long Call',
  profit_target_pct: 100,
  entry_action: 'buy',
}

export const MOCK_PORTFOLIO = {
  cash: 9_910,
  positions_value: 510,
  total_value: 10_420,
  total_pnl: 420,
}

export const MOCK_ORDER = {
  id: 'ord-001',
  timestamp: '2024-01-10T14:30:00Z',
  symbol: 'AAPL',
  expiry: '2024-01-19',
  strike: 185,
  option_type: 'call',
  action: 'buy',
  quantity: 1,
  price: 4.2,
  status: 'filled',
}

export const MOCK_WATCHLIST = {
  symbols: ['AAPL', 'MSFT', 'TSLA'],
  tier: 'pro',
  max_symbols: 20,
  scans_used: 3,
  max_scans_per_month: 100,
}

export const MOCK_AI_SETTINGS = {
  narrative_enabled: true,
  chat_enabled: true,
  risk_summary_enabled: true,
  strategy_reasoning_enabled: true,
}

export const MOCK_POSITION_RISK = {
  ...MOCK_POSITION,
  dte: 9,
  pnl_pct: 21.4,
  risk_level: 'yellow',
  iv_rank: 42,
  iv_environment: 'MEDIUM',
  bias: 'BULLISH',
  signals: [
    { level: 'yellow', type: 'DTE', msg: '9 days to expiry — consider rolling or closing.' },
    { level: 'green', type: 'PNL', msg: 'Position is profitable at +21.4%.' },
  ],
}

export const MOCK_REDDIT_POST = {
  title: 'AAPL earnings beat estimates — what options play next?',
  subreddit: 'wallstreetbets',
  score: 2840,
  num_comments: 312,
  url: 'https://reddit.com/r/wallstreetbets/comments/example',
  flair: 'Discussion',
  created_utc: 1704892200,
}

export const MOCK_PNL_HISTORY = [
  { date: '2024-01-01', portfolio_value: 10000, daily_pnl: 0 },
  { date: '2024-01-05', portfolio_value: 10150, daily_pnl: 150 },
  { date: '2024-01-10', portfolio_value: 10420, daily_pnl: 270 },
]

export const MOCK_AUTH_ME = {
  id: MOCK_USER.id,
  email: MOCK_USER.email,
  full_name: 'Test User',
  role: 'user',
  tier: 'pro',
}

export const MOCK_ADMIN_USERS = [
  { id: 'user-001', email: 'test@example.com', full_name: 'Test User', role: 'user', tier: 'pro', created_at: '2024-01-01T00:00:00Z' },
  { id: 'user-002', email: 'other@example.com', full_name: 'Other User', role: 'user', tier: 'free', created_at: '2024-01-02T00:00:00Z' },
]
