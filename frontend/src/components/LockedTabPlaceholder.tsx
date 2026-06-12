const C = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#7c6af7',
}

interface Props {
  requiredTier: string
  onUpgradeClick: () => void
}

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export default function LockedTabPlaceholder({ requiredTier, onUpgradeClick }: Props) {
  const tierLabel = TIER_LABELS[requiredTier] ?? requiredTier

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        gap: '16px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '40px' }}>🔒</div>
      <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: C.text }}>
        {tierLabel} plan required
      </h2>
      <p style={{ margin: 0, fontSize: '14px', color: C.muted, maxWidth: '340px', lineHeight: 1.6 }}>
        This feature is available on the{' '}
        <strong style={{ color: C.accent }}>{tierLabel}</strong> plan and above.
        Upgrade to unlock access.
      </p>
      <button
        onClick={onUpgradeClick}
        style={{
          background: C.accent,
          border: 'none',
          borderRadius: '8px',
          color: '#fff',
          padding: '10px 24px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
        }}
      >
        Upgrade to {tierLabel}
      </button>
    </div>
  )
}
