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
  top_strategy: {
    key: 'bull_call_spread',
    name: 'Bull Call Spread',
    description: 'Debit spread for moderate upside',
    direction: ['bullish'],
    iv_environment: ['low', 'medium'],
    risk_type: 'defined',
    complexity: 2,
    dte_target: 30,
    pop_range: [55, 65] as [number, number],
    profit_target_pct: 50,
    fit_score: 0.88,
  },
  scan_narrative: { headline: 'AAPL shows moderate IV with a bullish bias. Consider debit spreads.' },
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

// ─── New SaaS mock data ──────────────────────────────────────────────────────────────────────────

/** Login response shape from POST /api/auth/login (new format) */
export const MOCK_LOGIN_RESPONSE = {
  ok: true,
  email: MOCK_USER.email,
  onboarding_completed: true,
  onboarding_step: 'complete',
  is_deactivated: false,
}

/** Login response for a user who has NOT completed onboarding */
export const MOCK_LOGIN_RESPONSE_ONBOARDING = {
  ok: true,
  email: 'newuser@example.com',
  onboarding_completed: false,
  onboarding_step: 'plan_selection',
  is_deactivated: false,
}

/** Pro-tier entitlements returned by GET /api/auth/entitlements */
export const MOCK_ENTITLEMENTS_PRO = {
  effective_tier: 'pro',
  subscription_status: 'active',
  stripe_tier: 'pro',
  admin_override_tier: null,
  max_symbols: 50,
  max_scans_per_month: null,
  features: {
    trading_desk: true,
    positions: true,
    risk_monitor: false,
  },
  current_period_end: '2026-07-12T00:00:00Z',
  cancel_at_period_end: false,
  pending_tier_key: null,
  payment_failed: false,
}

/** Free-tier entitlements — positions and trading_desk locked */
export const MOCK_ENTITLEMENTS_FREE = {
  effective_tier: 'free',
  subscription_status: 'active',
  stripe_tier: 'free',
  admin_override_tier: null,
  max_symbols: 5,
  max_scans_per_month: 10,
  features: {
    trading_desk: false,
    positions: false,
    risk_monitor: false,
  },
  current_period_end: null,
  cancel_at_period_end: false,
  pending_tier_key: null,
  payment_failed: false,
}

/** past_due entitlements — payment failed, degraded to free */
export const MOCK_ENTITLEMENTS_PAST_DUE = {
  ...MOCK_ENTITLEMENTS_FREE,
  subscription_status: 'past_due',
  stripe_tier: 'pro',
  payment_failed: true,
}

/** Entitlements with cancel_at_period_end scheduled */
export const MOCK_ENTITLEMENTS_CANCEL_SCHEDULED = {
  ...MOCK_ENTITLEMENTS_PRO,
  cancel_at_period_end: true,
}

/** Public pricing plans from GET /api/public/pricing */
export const MOCK_PUBLIC_PRICING = {
  plans: [
    {
      tier_key: 'free',
      display_name: 'Free',
      price_monthly_usd: 0,
      max_symbols: 5,
      max_scans_per_month: 10,
      features: { trading_desk: false, positions: false, risk_monitor: false },
    },
    {
      tier_key: 'starter',
      display_name: 'Starter',
      price_monthly_usd: 9,
      max_symbols: 15,
      max_scans_per_month: 100,
      features: { trading_desk: false, positions: true, risk_monitor: false },
    },
    {
      tier_key: 'pro',
      display_name: 'Pro',
      price_monthly_usd: 29,
      max_symbols: 50,
      max_scans_per_month: null,
      features: { trading_desk: true, positions: true, risk_monitor: false },
    },
    {
      tier_key: 'enterprise',
      display_name: 'Enterprise',
      price_monthly_usd: 99,
      max_symbols: null,
      max_scans_per_month: null,
      features: { trading_desk: true, positions: true, risk_monitor: true },
      contact_us: true,
    },
  ],
}

/** Invoices returned by GET /api/billing/invoices */
export const MOCK_INVOICES = {
  invoices: [
    {
      id: 'inv-001',
      stripe_invoice_id: 'in_test_001',
      amount_paid: 29.00,
      currency: 'usd',
      status: 'paid',
      description: 'Pro subscription',
      period_start: '2026-06-12T00:00:00Z',
      period_end: '2026-07-12T00:00:00Z',
      invoice_pdf: 'https://pay.stripe.com/invoice/test-001',
      created_at: '2026-06-12T10:00:00Z',
    },
    {
      id: 'inv-002',
      stripe_invoice_id: 'in_test_002',
      amount_paid: 29.00,
      currency: 'usd',
      status: 'paid',
      description: 'Pro subscription',
      period_start: '2026-05-12T00:00:00Z',
      period_end: '2026-06-12T00:00:00Z',
      invoice_pdf: 'https://pay.stripe.com/invoice/test-002',
      created_at: '2026-05-12T10:00:00Z',
    },
  ],
}

/** Payment method from GET /api/billing/payment-method */
export const MOCK_PAYMENT_METHOD = {
  brand: 'visa',
  last4: '4242',
  exp_month: 12,
  exp_year: 2028,
}

/** Public FAQ from GET /api/public/faq */
export const MOCK_PUBLIC_FAQ = {
  categories: [
    {
      id: 'cat-001',
      title: 'Getting Started',
      articles: [
        {
          id: 'art-001',
          question: 'What is OptionsDesk?',
          answer_markdown: 'OptionsDesk is an AI-powered paper trading options dashboard.',
          sort_order: 0,
        },
        {
          id: 'art-002',
          question: 'How do I sign up?',
          answer_markdown: 'Click Sign Up on the login page and choose a plan.',
          sort_order: 1,
        },
      ],
    },
    {
      id: 'cat-002',
      title: 'Billing',
      articles: [
        {
          id: 'art-003',
          question: 'How do I cancel my subscription?',
          answer_markdown: 'Go to Settings > Danger Zone and click Cancel subscription.',
          sort_order: 0,
        },
      ],
    },
  ],
}

/** Checkout session response from POST /api/billing/checkout-session */
export const MOCK_CHECKOUT_SESSION = {
  checkout_url: 'https://checkout.stripe.com/pay/cs_test_mock',
}

/** Billing portal session response from POST /api/billing/portal */
export const MOCK_PORTAL_SESSION = {
  portal_url: 'https://billing.stripe.com/session/test_mock',
}

/** Cancel subscription response from POST /api/billing/cancel */
export const MOCK_CANCEL_RESPONSE = {
  ok: true,
  cancels_at: '2026-07-12T00:00:00Z',
}

/** Reactivate response from POST /api/billing/reactivate */
export const MOCK_REACTIVATE_RESPONSE = {
  ok: true,
}

// ─── Admin portal mock data ───────────────────────────────────────────────────────────────────────

/** Staff profile for an owner-role admin */
export const MOCK_STAFF_ME_OWNER = {
  id: 'staff-owner-001',
  email: 'owner@optionsdeskpro.com',
  full_name: 'Platform Owner',
  staff_role: 'owner',
  is_active: true,
}

/** Staff profile for a support-role staff member */
export const MOCK_STAFF_ME_SUPPORT = {
  id: 'staff-support-001',
  email: 'support@optionsdeskpro.com',
  full_name: 'Support Staff',
  staff_role: 'support',
  is_active: true,
}

/** Subscriber list from GET /api/platform/subscribers */
export const MOCK_SUBSCRIBER_LIST = {
  total: 2,
  page: 1,
  page_size: 50,
  subscribers: [
    {
      id: 'sub-user-001',
      email: 'alice@example.com',
      full_name: 'Alice Smith',
      tier_key: 'pro',
      subscription_status: 'active',
      stripe_customer_id: 'cus_test_abcd',
      created_at: '2026-05-01T00:00:00Z',
      last_seen_at: '2026-06-12T08:30:00Z',
      is_active: true,
    },
    {
      id: 'sub-user-002',
      email: 'bob@example.com',
      full_name: 'Bob Jones',
      tier_key: 'free',
      subscription_status: 'active',
      stripe_customer_id: null,
      created_at: '2026-06-01T00:00:00Z',
      last_seen_at: '2026-06-10T14:00:00Z',
      is_active: true,
    },
  ],
}

/** Subscriber detail from GET /api/platform/subscribers/{id} */
export const MOCK_SUBSCRIBER_DETAIL = {
  profile: {
    id: 'sub-user-001',
    email: 'alice@example.com',
    full_name: 'Alice Smith',
    avatar_url: null,
    created_at: '2026-05-01T00:00:00Z',
    last_seen_at: '2026-06-12T08:30:00Z',
    onboarding_completed: true,
    is_active: true,
  },
  subscription: {
    tier_key: 'pro',
    status: 'active',
    current_period_end: '2026-07-12T00:00:00Z',
    cancel_at_period_end: false,
    stripe_customer_id: 'cus_test_abcd',
    stripe_subscription_id: 'sub_test_001',
  },
  positions_count: 3,
  orders_count: 12,
  invoices: MOCK_INVOICES.invoices,
}

/** Platform pricing from GET /api/platform/pricing */
export const MOCK_PLATFORM_PRICING = {
  plans: MOCK_PUBLIC_PRICING.plans.map(p => ({
    ...p,
    stripe_price_id: p.tier_key !== 'free' && p.tier_key !== 'enterprise' ? `price_test_${p.tier_key}` : null,
    stripe_product_id: p.tier_key !== 'free' ? `prod_test_${p.tier_key}` : null,
    is_active: true,
    sort_order: ['free', 'starter', 'pro', 'enterprise'].indexOf(p.tier_key),
  })),
}

/** Revenue metrics from GET /api/platform/revenue */
export const MOCK_REVENUE_METRICS = {
  mrr_current_usd: 2523.00,
  mrr_by_month: [
    { month: '2026-01', mrr_usd: 1200 },
    { month: '2026-02', mrr_usd: 1450 },
    { month: '2026-03', mrr_usd: 1700 },
    { month: '2026-04', mrr_usd: 2000 },
    { month: '2026-05', mrr_usd: 2300 },
    { month: '2026-06', mrr_usd: 2523 },
  ],
  active_subscribers_by_tier: { free: 412, starter: 63, pro: 24, enterprise: 2 },
  new_this_month: 18,
  churned_this_month: 3,
  past_due_count: 4,
  past_due_amount_at_risk_usd: 116.00,
}

/** Health panel data from GET /api/platform/health */
export const MOCK_HEALTH_DATA = {
  api_status: 'ok',
  market_data_source: 'yfinance',
  requests_last_24h: { strategy_analyze: 312, strategy_scan: 87 },
  active_sessions_last_15min: 14,
}

/** Staff list from GET /api/platform/staff */
export const MOCK_STAFF_LIST = {
  staff: [
    {
      id: 'staff-owner-001',
      email: 'owner@optionsdeskpro.com',
      full_name: 'Platform Owner',
      staff_role: 'owner',
      is_active: true,
      last_seen_at: '2026-06-12T09:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'staff-support-001',
      email: 'support@optionsdeskpro.com',
      full_name: 'Support Staff',
      staff_role: 'support',
      is_active: true,
      last_seen_at: '2026-06-11T16:00:00Z',
      created_at: '2026-03-01T00:00:00Z',
    },
  ],
}

// ─── Legal Terms Acknowledgment mock data ─────────────────────────────────────

export const MOCK_LEGAL_VERSION = {
  id: 'ver-uuid-1',
  version_number: '1.0',
  title: 'Risk Disclosure & Indemnification Agreement',
  content_markdown: 'MOCK LEGAL CONTENT\n\nThis is a mock legal document for testing purposes only.\n\nSection 1: Test content here.\n\nSection 2: More test content here.\n\nSection 3: Final test content here.',
  content_hash: 'abc123hash',
  effective_date: '2026-06-14',
  published_at: '2026-06-14T00:00:00Z',
  is_active: true,
}

export const MOCK_LEGAL_HISTORY = [
  {
    id: 'ack-uuid-1',
    version_number: '1.0',
    title: 'Risk Disclosure & Indemnification Agreement',
    effective_date: '2026-06-14',
    content_hash: 'abc123hash',
    acknowledged_at: '2026-06-14T03:00:00Z',
    ip_address: '203.0.113.42',
  },
]

export const MOCK_LEGAL_PENDING_COUNT = { pending_count: 3, current_version_number: '1.0' }
export const MOCK_LEGAL_VERSIONS_LIST = { versions: [MOCK_LEGAL_VERSION] }

/** Login response for a user who has completed onboarding but has a pending legal acknowledgment */
export const MOCK_LOGIN_RESPONSE_PENDING_LEGAL = {
  ok: true,
  email: 'test@example.com',
  onboarding_completed: true,
  onboarding_step: 'complete',
  is_deactivated: false,
  pending_legal_acknowledgment: true,
}

/** Login response for onboarding user at the legal_acknowledgment step */
export const MOCK_LOGIN_RESPONSE_LEGAL_ONBOARDING = {
  ok: true,
  email: 'newuser@example.com',
  onboarding_completed: false,
  onboarding_step: 'legal_acknowledgment',
  is_deactivated: false,
  pending_legal_acknowledgment: false,
}

// ─── Backend-auth-proxy session mock data ──────────────────────────────────────

/** GET /api/auth/session response for a regular pro user */
export const MOCK_SESSION_RESPONSE = {
  user_id: MOCK_USER.id,
  email: MOCK_USER.email,
  full_name: 'Test User',
  avatar_url: null,
  role: 'user',
  is_admin: false,
  onboarding_completed: true,
  onboarding_step: 'complete',
  pending_legal_acknowledgment: false,
  subscription_tier: 'pro',
}

/** GET /api/auth/session response for an admin user */
export const MOCK_SESSION_RESPONSE_ADMIN = {
  ...MOCK_SESSION_RESPONSE,
  email: MOCK_ADMIN_USER.email,
  role: 'admin',
  is_admin: true,
}

// ─── Strategy Comparison Matrix mock data (PRD-01) ───────────────────────────

/**
 * MatrixRow where BOTH iv_condition_match and direction_condition_match are true.
 * Represents an Iron Condor in a HIGH IV, NEUTRAL environment.
 * max_loss is a defined number; max_profit is also defined.
 */
export const MOCK_MATRIX_ROW_BOTH_MATCH = {
  key: 'iron_condor',
  name: 'Iron Condor',
  direction: ['NEUTRAL'],
  credit_or_debit: 'credit' as const,
  risk_type: 'DEFINED' as const,
  complexity: 2,
  iv_environment_fit: ['HIGH'],
  iv_fit_label: 'Performs well in HIGH IV',
  dte_target: 45,
  max_profit: 1.85,
  max_loss: 3.15,
  breakeven_low: 168.15,
  breakeven_high: 201.85,
  net_delta: 0.02,
  net_theta: 0.12,
  net_vega: -0.22,
  pop_range: [60, 70] as [number, number],
  designed_for_iv: 'high' as const,
  designed_for_direction: 'neutral' as const,
  iv_condition_match: true,
  direction_condition_match: true,
  condition_explanation:
    'Iron Condors are designed for HIGH IV environments where elevated option premiums increase the credit collected on both spread legs. The current ticker IV rank of 72 exceeds the 60-point threshold typically considered high. The strategy is mechanically designed for a NEUTRAL directional outlook, matching the current neutral bias.',
  _synthetic: false,
}

/**
 * MatrixRow where only iv_condition_match is true, direction_condition_match is false.
 * Represents a Covered Call in a HIGH IV environment with NEUTRAL (not BULLISH) bias.
 * max_loss is null — undefined risk (own shares can fall to zero).
 */
export const MOCK_MATRIX_ROW_IV_ONLY_MATCH = {
  key: 'covered_call',
  name: 'Covered Call',
  direction: ['BULLISH'],
  credit_or_debit: 'credit' as const,
  risk_type: 'UNDEFINED' as const,
  complexity: 1,
  iv_environment_fit: ['HIGH'],
  iv_fit_label: 'Performs well in HIGH IV',
  dte_target: 45,
  max_profit: 1.42,
  max_loss: null,
  breakeven_low: null,
  breakeven_high: null,
  net_delta: 0.30,
  net_theta: 0.04,
  net_vega: -0.08,
  pop_range: [50, 70] as [number, number],
  designed_for_iv: 'high' as const,
  designed_for_direction: 'bullish' as const,
  iv_condition_match: true,
  direction_condition_match: false,
  condition_explanation:
    'Covered calls collect premium by selling a call against owned shares; this strategy is designed for HIGH IV environments where elevated option premiums increase income. The current IV rank of 72 satisfies that criterion. However, the strategy is mechanically designed for a BULLISH directional view — the current bias is NEUTRAL, which does not fully match the bullish design intent.',
  _synthetic: false,
}

/**
 * MatrixRow where NEITHER iv_condition_match nor direction_condition_match is true.
 * Represents a Long Call in a HIGH IV environment with NEUTRAL bias.
 * max_profit is null — unlimited upside.
 * net_theta is null — greek data unavailable.
 */
export const MOCK_MATRIX_ROW_NO_MATCH = {
  key: 'long_call',
  name: 'Long Call',
  direction: ['BULLISH'],
  credit_or_debit: 'debit' as const,
  risk_type: 'DEFINED' as const,
  complexity: 1,
  iv_environment_fit: ['LOW', 'MEDIUM'],
  iv_fit_label: 'Performs well in LOW IV',
  dte_target: 30,
  max_profit: null,
  max_loss: 2.10,
  breakeven_low: 187.10,
  breakeven_high: null,
  net_delta: 0.45,
  net_theta: null,
  net_vega: 0.18,
  pop_range: [35, 50] as [number, number],
  designed_for_iv: 'low' as const,
  designed_for_direction: 'bullish' as const,
  iv_condition_match: false,
  direction_condition_match: false,
  condition_explanation:
    'Long Calls are designed for LOW IV environments where option premiums are cheaper, reducing the cost of the long premium position. The current IV rank of 72 is HIGH, which makes buying options more expensive than the textbook design criterion specifies. The strategy is also designed for a BULLISH directional view; the current bias is NEUTRAL.',
  _synthetic: false,
}

/** Full comparison_matrix array used in analyze response mocks */
export const MOCK_COMPARISON_MATRIX = [
  MOCK_MATRIX_ROW_BOTH_MATCH,
  MOCK_MATRIX_ROW_IV_ONLY_MATCH,
  MOCK_MATRIX_ROW_NO_MATCH,
]

/**
 * Updated MOCK_ANALYZE_RESPONSE shaped for PRD-01:
 * - ai_recommendation field is absent
 * - comparison_matrix field is present
 * - fit_score is absent from each StrategyRecommendation
 */
export const MOCK_ANALYZE_RESPONSE_V2 = {
  symbol: 'AAPL',
  iv_analysis: {
    symbol: 'AAPL',
    current_iv: 0.38,
    iv_rank: 72,
    hv_30d: 0.28,
    hv_52wk_high: 0.52,
    hv_52wk_low: 0.18,
    iv_environment: 'HIGH',
    percentile_label: 'IVR 72 — High IV',
    error: null,
  },
  bias_analysis: {
    symbol: 'AAPL',
    price: 185.5,
    sma20: 182.3,
    sma50: 178.6,
    rsi14: 55.1,
    bias: 'NEUTRAL',
    strength: 'MODERATE',
    error: null,
  },
  detected_bias: 'NEUTRAL',
  recommendations_by_category: {
    NEUTRAL: [
      {
        key: 'iron_condor',
        name: 'Iron Condor',
        description: 'Sell an OTM call spread and an OTM put spread simultaneously.',
        direction: ['NEUTRAL'],
        iv_environment: ['HIGH'],
        risk_type: 'DEFINED',
        complexity: 2,
        dte_target: 45,
        pop_range: [60, 70] as [number, number],
        profit_target_pct: 50,
        trade: null,
      },
    ],
    BULLISH: [],
    BEARISH: [],
  },
  comparison_matrix: MOCK_COMPARISON_MATRIX,
}

/**
 * Alternate analyze response for a DIFFERENT ticker (MSFT) with the SAME iv_environment
 * and bias as AAPL — used to verify condition_explanation strings are identical
 * across tickers with the same environment (AC-6.7).
 */
export const MOCK_ANALYZE_RESPONSE_V2_MSFT = {
  ...MOCK_ANALYZE_RESPONSE_V2,
  symbol: 'MSFT',
  iv_analysis: {
    ...MOCK_ANALYZE_RESPONSE_V2.iv_analysis,
    symbol: 'MSFT',
  },
  bias_analysis: {
    ...MOCK_ANALYZE_RESPONSE_V2.bias_analysis,
    symbol: 'MSFT',
  },
  // comparison_matrix rows carry identical condition_explanation strings — same IV env + bias
  comparison_matrix: MOCK_COMPARISON_MATRIX,
}

/**
 * Updated MOCK_SCAN_RESULT shaped for PRD-01:
 * - top_strategy field is absent
 * - scan_narrative field is absent
 * - strategy_count field is present
 * - condition_matches field is present
 */
export const MOCK_SCAN_RESULT_V2 = {
  symbol: 'AAPL',
  price: 185.5,
  iv_rank: 72,
  current_iv: 0.38,
  iv_environment: 'HIGH',
  percentile_label: 'IVR 72 — High IV',
  bias: 'NEUTRAL',
  bias_strength: 'MODERATE',
  rsi14: 55.1,
  strategy_count: 14,
  condition_matches: 8,
  error: null,
}

/** A second scan result row for MSFT — used alongside AAPL in scan table tests */
export const MOCK_SCAN_RESULT_V2_MSFT = {
  symbol: 'MSFT',
  price: 421.30,
  iv_rank: 38,
  current_iv: 0.29,
  iv_environment: 'MEDIUM',
  percentile_label: 'IVR 38 — Medium IV',
  bias: 'BULLISH',
  bias_strength: 'MODERATE',
  rsi14: 61.4,
  strategy_count: 11,
  condition_matches: 5,
  error: null,
}

/** Platform FAQ (admin view, includes drafts) */
export const MOCK_ADMIN_FAQ = {
  categories: [
    {
      id: 'cat-001',
      title: 'Getting Started',
      articles: [
        {
          id: 'art-001',
          question: 'What is OptionsDesk?',
          answer_markdown: 'OptionsDesk is an AI-powered paper trading options dashboard.',
          sort_order: 0,
          is_published: true,
        },
        {
          id: 'art-draft-001',
          question: 'Draft article',
          answer_markdown: 'This article is in draft.',
          sort_order: 1,
          is_published: false,
        },
      ],
    },
  ],
}

// ─── Net Order Price Box mock data (scanner-net-order-price-30Jun2026) ────────

/**
 * A complete TradeStructure for the QQQ Put Broken Wing Butterfly.
 * Legs: BUY 1×739 put @28.26, SELL 2×704 put @14.80, BUY 1×645 put @4.83.
 * signedNet = −28.26 + (2 × 14.80) − 4.83 = −3.49 (debit)
 * totalDollars = −349
 * estimated_credit_or_debit = −3.49 (matches leg-mid computation exactly)
 */
export const MOCK_TRADE_DEBIT_MULTILEG = {
  strategy: 'Put Broken Wing Butterfly',
  strategy_key: 'put_bwb',
  expiry: '2026-08-15',
  legs: [
    { role: 'Long Put 1', option_type: 'put', strike: 739, delta: -0.45, gamma: 0.02, theta: -0.12, vega: 0.30, bid: 27.90, ask: 28.62, mid: 28.26, action: 'buy' },
    { role: 'Short Put 1', option_type: 'put', strike: 704, delta: -0.28, gamma: 0.03, theta: -0.08, vega: 0.22, bid: 14.50, ask: 15.10, mid: 14.80, action: 'sell' },
    { role: 'Short Put 2', option_type: 'put', strike: 704, delta: -0.28, gamma: 0.03, theta: -0.08, vega: 0.22, bid: 14.50, ask: 15.10, mid: 14.80, action: 'sell' },
    { role: 'Long Put 2', option_type: 'put', strike: 645, delta: -0.12, gamma: 0.01, theta: -0.04, vega: 0.10, bid: 4.60, ask: 5.06, mid: 4.83, action: 'buy' },
  ],
  max_profit: 31.51,
  max_loss: 3.49,
  estimated_credit_or_debit: -3.49,
  pop_estimate: 72,
  breakeven_low: 700.51,
  breakeven_high: null,
  tastylive_profit_target: null,
  risk_type: 'DEFINED',
  profit_target_pct: 50,
}

/**
 * A complete TradeStructure for an Iron Condor.
 * Legs: SELL 115P @1.85, BUY 110P @0.63, SELL 125C @1.45, BUY 130C @0.52.
 * signedNet = 1.85 − 0.63 + 1.45 − 0.52 = +2.15 (credit)
 * totalDollars = +215
 * estimated_credit_or_debit = 2.15
 */
export const MOCK_TRADE_CREDIT_MULTILEG = {
  strategy: 'Iron Condor',
  strategy_key: 'iron_condor',
  expiry: '2026-08-15',
  legs: [
    { role: 'Short Put', option_type: 'put', strike: 115, delta: -0.18, gamma: 0.02, theta: 0.09, vega: -0.18, bid: 1.80, ask: 1.90, mid: 1.85, action: 'sell' },
    { role: 'Long Put', option_type: 'put', strike: 110, delta: -0.10, gamma: 0.01, theta: 0.04, vega: -0.10, bid: 0.58, ask: 0.68, mid: 0.63, action: 'buy' },
    { role: 'Short Call', option_type: 'call', strike: 125, delta: 0.17, gamma: 0.02, theta: 0.08, vega: -0.16, bid: 1.40, ask: 1.50, mid: 1.45, action: 'sell' },
    { role: 'Long Call', option_type: 'call', strike: 130, delta: 0.10, gamma: 0.01, theta: 0.04, vega: -0.09, bid: 0.47, ask: 0.57, mid: 0.52, action: 'buy' },
  ],
  max_profit: 2.15,
  max_loss: 2.85,
  estimated_credit_or_debit: 2.15,
  pop_estimate: 65,
  breakeven_low: 112.85,
  breakeven_high: 127.15,
  tastylive_profit_target: 1.08,
  risk_type: 'DEFINED',
  profit_target_pct: 50,
}

/**
 * A complete TradeStructure for a Short Naked Put (single-leg after stock filtering).
 * displayLegs.length === 1 after stock-leg filter — NetOrderPriceBox must NOT render.
 */
export const MOCK_TRADE_SINGLE_LEG = {
  strategy: 'Short Naked Put',
  strategy_key: 'short_naked_put',
  expiry: '2026-08-15',
  legs: [
    { role: 'Short Put', option_type: 'put', strike: 180, delta: -0.30, gamma: 0.02, theta: 0.08, vega: -0.18, bid: 2.90, ask: 3.10, mid: 3.00, action: 'sell' },
  ],
  max_profit: 3.00,
  max_loss: null,
  estimated_credit_or_debit: 3.00,
  pop_estimate: 70,
  breakeven_low: 177.00,
  breakeven_high: null,
  tastylive_profit_target: null,
  risk_type: 'UNDEFINED',
  profit_target_pct: 50,
}

/**
 * A complete TradeStructure for a Bull Call Spread where one leg has mid === 0.
 * This triggers the amber caution path in NetOrderPriceBox.
 * BUY 150C @3.20, SELL 155C mid=0 (zero-mid condition).
 */
export const MOCK_TRADE_ZERO_MID = {
  strategy: 'Bull Call Spread',
  strategy_key: 'bull_call_spread',
  expiry: '2026-08-15',
  legs: [
    { role: 'Long Call', option_type: 'call', strike: 150, delta: 0.48, gamma: 0.03, theta: -0.10, vega: 0.25, bid: 3.10, ask: 3.30, mid: 3.20, action: 'buy' },
    { role: 'Short Call', option_type: 'call', strike: 155, delta: 0.25, gamma: 0.02, theta: -0.06, vega: 0.15, bid: 0, ask: 0, mid: 0, action: 'sell' },
  ],
  max_profit: null,
  max_loss: 3.20,
  estimated_credit_or_debit: -3.20,
  pop_estimate: 48,
  breakeven_low: 153.20,
  breakeven_high: null,
  tastylive_profit_target: null,
  risk_type: 'DEFINED',
  profit_target_pct: 50,
}

/**
 * A Bull Call Spread with valid mids (no zero-mid condition).
 * BUY 150C @3.20, SELL 155C @1.05.
 * signedNet = −3.20 + 1.05 = −2.15 (debit)
 * Used to verify full box content for a clean 2-leg debit spread.
 */
export const MOCK_TRADE_BULL_CALL_SPREAD = {
  strategy: 'Bull Call Spread',
  strategy_key: 'bull_call_spread',
  expiry: '2026-08-15',
  legs: [
    { role: 'Long Call', option_type: 'call', strike: 150, delta: 0.48, gamma: 0.03, theta: -0.10, vega: 0.25, bid: 3.10, ask: 3.30, mid: 3.20, action: 'buy' },
    { role: 'Short Call', option_type: 'call', strike: 155, delta: 0.25, gamma: 0.02, theta: -0.06, vega: 0.15, bid: 0.98, ask: 1.12, mid: 1.05, action: 'sell' },
  ],
  max_profit: 2.85,
  max_loss: 2.15,
  estimated_credit_or_debit: -2.15,
  pop_estimate: 52,
  breakeven_low: 152.15,
  breakeven_high: null,
  tastylive_profit_target: null,
  risk_type: 'DEFINED',
  profit_target_pct: 50,
}

// ─── Analyze responses that include full trade structures ──────────────────

/** StrategyRecommendation base shape (shared fields) */
const baseRec = {
  description: 'Mock strategy for NetOrderPriceBox tests.',
  direction: ['BULLISH'] as string[],
  iv_environment: ['MEDIUM'] as string[],
  risk_type: 'DEFINED',
  complexity: 2,
  dte_target: 45,
  pop_range: [50, 65] as [number, number],
  profit_target_pct: 50,
}

/**
 * Analyze response with a debit 4-leg strategy (QQQ Put BWB) in the BULLISH category.
 * signedNet = −3.49 (debit): BUY 1×739 @28.26, SELL 2×704 @14.80, BUY 1×645 @4.83
 * The body SELL legs are deduplicated by TradeInstructions into qty:2.
 */
export const MOCK_ANALYZE_WITH_DEBIT_TRADE = {
  symbol: 'QQQ',
  iv_analysis: {
    symbol: 'QQQ',
    current_iv: 0.28,
    iv_rank: 42,
    iv_source: 'option_chain' as const,
    hv_30d: 0.22,
    hv_52wk_high: 0.45,
    hv_52wk_low: 0.18,
    iv_environment: 'MEDIUM',
    percentile_label: 'IVR 42 — Medium IV',
    error: null,
  },
  bias_analysis: {
    symbol: 'QQQ',
    price: 720.0,
    sma20: 710.0,
    sma50: 695.0,
    rsi14: 58.0,
    bias: 'BULLISH',
    strength: 'MODERATE',
    error: null,
  },
  detected_bias: 'BULLISH',
  recommendations_by_category: {
    BULLISH: [
      {
        ...baseRec,
        key: 'put_bwb',
        name: 'Put Broken Wing Butterfly',
        trade: MOCK_TRADE_DEBIT_MULTILEG,
      },
    ],
    BEARISH: [],
    NEUTRAL: [],
    NEUTRAL_BULLISH: [],
    NEUTRAL_BEARISH: [],
    OMNIDIRECTIONAL: [],
  },
  comparison_matrix: MOCK_COMPARISON_MATRIX,
  news_sentiment: null,
}

/**
 * Analyze response with a credit 4-leg Iron Condor in the NEUTRAL category.
 * signedNet = +2.15 (credit)
 */
export const MOCK_ANALYZE_WITH_CREDIT_TRADE = {
  symbol: 'SPY',
  iv_analysis: {
    symbol: 'SPY',
    current_iv: 0.38,
    iv_rank: 72,
    iv_source: 'option_chain' as const,
    hv_30d: 0.28,
    hv_52wk_high: 0.52,
    hv_52wk_low: 0.18,
    iv_environment: 'HIGH',
    percentile_label: 'IVR 72 — High IV',
    error: null,
  },
  bias_analysis: {
    symbol: 'SPY',
    price: 550.0,
    sma20: 545.0,
    sma50: 535.0,
    rsi14: 52.0,
    bias: 'NEUTRAL',
    strength: 'MODERATE',
    error: null,
  },
  detected_bias: 'NEUTRAL',
  recommendations_by_category: {
    BULLISH: [],
    BEARISH: [],
    NEUTRAL: [
      {
        ...baseRec,
        key: 'iron_condor',
        name: 'Iron Condor',
        direction: ['NEUTRAL'],
        trade: MOCK_TRADE_CREDIT_MULTILEG,
      },
    ],
    NEUTRAL_BULLISH: [],
    NEUTRAL_BEARISH: [],
    OMNIDIRECTIONAL: [],
  },
  comparison_matrix: MOCK_COMPARISON_MATRIX,
  news_sentiment: null,
}

/**
 * Analyze response with a single-leg Short Naked Put.
 * displayLegs.length === 1 after stock-leg filter → NetOrderPriceBox must NOT render.
 */
export const MOCK_ANALYZE_WITH_SINGLE_LEG_TRADE = {
  symbol: 'AAPL',
  iv_analysis: {
    symbol: 'AAPL',
    current_iv: 0.28,
    iv_rank: 42,
    iv_source: 'option_chain' as const,
    hv_30d: 0.22,
    hv_52wk_high: 0.45,
    hv_52wk_low: 0.18,
    iv_environment: 'MEDIUM',
    percentile_label: 'IVR 42 — Medium IV',
    error: null,
  },
  bias_analysis: {
    symbol: 'AAPL',
    price: 185.5,
    sma20: 182.3,
    sma50: 178.6,
    rsi14: 58.4,
    bias: 'NEUTRAL_BULLISH',
    strength: 'MODERATE',
    error: null,
  },
  detected_bias: 'NEUTRAL_BULLISH',
  recommendations_by_category: {
    BULLISH: [],
    BEARISH: [],
    NEUTRAL: [],
    NEUTRAL_BULLISH: [
      {
        ...baseRec,
        key: 'short_naked_put',
        name: 'Short Naked Put',
        direction: ['NEUTRAL_BULLISH'],
        trade: MOCK_TRADE_SINGLE_LEG,
      },
    ],
    NEUTRAL_BEARISH: [],
    OMNIDIRECTIONAL: [],
  },
  comparison_matrix: MOCK_COMPARISON_MATRIX,
  news_sentiment: null,
}

/**
 * Analyze response with a Bull Call Spread where the short leg has mid === 0.
 * NetOrderPriceBox must render with amber caution text, no formula or signed number.
 */
export const MOCK_ANALYZE_WITH_ZERO_MID_TRADE = {
  symbol: 'TSLA',
  iv_analysis: {
    symbol: 'TSLA',
    current_iv: 0.65,
    iv_rank: 85,
    iv_source: 'option_chain' as const,
    hv_30d: 0.55,
    hv_52wk_high: 0.90,
    hv_52wk_low: 0.35,
    iv_environment: 'HIGH',
    percentile_label: 'IVR 85 — High IV',
    error: null,
  },
  bias_analysis: {
    symbol: 'TSLA',
    price: 280.0,
    sma20: 270.0,
    sma50: 260.0,
    rsi14: 62.0,
    bias: 'BULLISH',
    strength: 'STRONG',
    error: null,
  },
  detected_bias: 'BULLISH',
  recommendations_by_category: {
    BULLISH: [
      {
        ...baseRec,
        key: 'bull_call_spread',
        name: 'Bull Call Spread',
        direction: ['BULLISH'],
        trade: MOCK_TRADE_ZERO_MID,
      },
    ],
    BEARISH: [],
    NEUTRAL: [],
    NEUTRAL_BULLISH: [],
    NEUTRAL_BEARISH: [],
    OMNIDIRECTIONAL: [],
  },
  comparison_matrix: MOCK_COMPARISON_MATRIX,
  news_sentiment: null,
}

/**
 * Analyze response with a clean 2-leg Bull Call Spread (no zero mids).
 * signedNet = −2.15 (debit): BUY 150C @3.20, SELL 155C @1.05
 */
export const MOCK_ANALYZE_WITH_BULL_CALL_SPREAD = {
  symbol: 'NVDA',
  iv_analysis: {
    symbol: 'NVDA',
    current_iv: 0.35,
    iv_rank: 55,
    iv_source: 'option_chain' as const,
    hv_30d: 0.30,
    hv_52wk_high: 0.60,
    hv_52wk_low: 0.22,
    iv_environment: 'MEDIUM',
    percentile_label: 'IVR 55 — Medium IV',
    error: null,
  },
  bias_analysis: {
    symbol: 'NVDA',
    price: 900.0,
    sma20: 880.0,
    sma50: 850.0,
    rsi14: 60.0,
    bias: 'BULLISH',
    strength: 'MODERATE',
    error: null,
  },
  detected_bias: 'BULLISH',
  recommendations_by_category: {
    BULLISH: [
      {
        ...baseRec,
        key: 'bull_call_spread',
        name: 'Bull Call Spread',
        direction: ['BULLISH'],
        trade: MOCK_TRADE_BULL_CALL_SPREAD,
      },
    ],
    BEARISH: [],
    NEUTRAL: [],
    NEUTRAL_BULLISH: [],
    NEUTRAL_BEARISH: [],
    OMNIDIRECTIONAL: [],
  },
  comparison_matrix: MOCK_COMPARISON_MATRIX,
  news_sentiment: null,
}
