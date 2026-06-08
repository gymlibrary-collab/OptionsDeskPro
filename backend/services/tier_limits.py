TIER_LIMITS: dict[str, dict] = {
    'free':       {'max_symbols': 5,    'max_scans_per_month': 10},
    'starter':    {'max_symbols': 15,   'max_scans_per_month': 100},
    'pro':        {'max_symbols': 50,   'max_scans_per_month': None},
    'enterprise': {'max_symbols': None, 'max_scans_per_month': None},
}


def get_limits(tier: str) -> dict:
    return TIER_LIMITS.get(tier, TIER_LIMITS['free'])


def get_user_tier(db, user_id: str) -> str:
    try:
        result = db.table('user_profiles').select('subscription_tier').eq('id', user_id).single().execute()
        return result.data.get('subscription_tier', 'free') if result.data else 'free'
    except Exception:
        return 'free'
