const C = {
  bg: '#7f1d1d',
  border: '#ef4444',
  text: '#fecaca',
  btn: '#ef4444',
}

interface Props {
  paymentFailed: boolean
  onUpdateCard: () => void
}

export default function PaymentFailedBanner({ paymentFailed, onUpdateCard }: Props) {
  if (!paymentFailed) return null

  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '18px' }}>!</span>
        <span style={{ fontSize: '13px', color: C.text, fontWeight: 600 }}>
          Payment failed — your subscription has been downgraded to Free. Update your card to restore access.
        </span>
      </div>
      <button
        onClick={onUpdateCard}
        style={{
          background: C.btn,
          border: 'none',
          borderRadius: '6px',
          color: '#fff',
          padding: '6px 14px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
        }}
      >
        Update Card
      </button>
    </div>
  )
}
