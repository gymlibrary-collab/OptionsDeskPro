import React, { useState, useEffect } from 'react'
import { placeOrder, OrderRequest } from '../api/client'
import { OrderPrefill } from '../App'

interface Props {
  prefill: OrderPrefill | null
  onOrderPlaced: () => void
}

const C = {
  bg: '#1a1d27',
  surface: '#252836',
  border: '#2d3148',
  text: '#e2e8f0',
  muted: '#64748b',
  accent: '#7c6af7',
  green: '#22c55e',
  red: '#ef4444',
}

const styles = {
  panel: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '14px',
  },
  title: {
    fontSize: '14px',
    fontWeight: 700,
    color: C.text,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${C.border}`,
    paddingBottom: '10px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  label: {
    fontSize: '11px',
    color: C.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    fontWeight: 600,
  },
  input: {
    background: C.surface,
    border: `1px solid #3a3f5c`,
    borderRadius: '6px',
    color: C.text,
    padding: '7px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
  },
  toggleRow: {
    display: 'flex',
    gap: '8px',
  },
  toggleBtn: (active: boolean, variant: 'buy' | 'sell' | 'call' | 'put') => {
    const colors: Record<string, { bg: string; border: string; color: string }> = {
      buy: { bg: '#0f2d1a', border: '#22c55e', color: '#22c55e' },
      sell: { bg: '#2d0f0f', border: '#ef4444', color: '#ef4444' },
      call: { bg: '#0d1a2d', border: '#3b82f6', color: '#3b82f6' },
      put: { bg: '#2d1a2d', border: '#a855f7', color: '#a855f7' },
    }
    const c = colors[variant]
    return {
      flex: 1,
      padding: '8px',
      borderRadius: '6px',
      fontSize: '13px',
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'all 0.15s',
      background: active ? c.bg : C.surface,
      border: `1px solid ${active ? c.border : '#3a3f5c'}`,
      color: active ? c.color : C.muted,
    }
  },
  estimateBox: {
    background: C.surface,
    border: `1px solid #3a3f5c`,
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  estimateLabel: {
    fontSize: '11px',
    color: C.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  estimateValue: {
    fontSize: '22px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: C.text,
  },
  estimateSub: {
    fontSize: '11px',
    color: C.muted,
  },
  submitBtn: (action: 'buy' | 'sell') => ({
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
    background: action === 'buy' ? '#22c55e' : '#ef4444',
    color: '#fff',
    width: '100%',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    transition: 'opacity 0.15s',
  }),
  feedback: (success: boolean) => ({
    padding: '10px',
    borderRadius: '6px',
    fontSize: '12px',
    background: success ? '#0f2d1a' : '#2d0f0f',
    border: `1px solid ${success ? '#22c55e' : '#ef4444'}`,
    color: success ? '#22c55e' : '#ef4444',
  }),
  divider: {
    borderTop: `1px solid ${C.border}`,
    margin: '0 -16px',
  },
}

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.72)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
}

const modalBoxStyle: React.CSSProperties = {
  background: '#1a1d27',
  border: '1px solid #2d3148',
  borderRadius: '12px',
  padding: '24px',
  maxWidth: '460px',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
}

interface ConfirmState {
  symbol: string
  expiry: string
  strike: number
  optionType: 'call' | 'put'
  action: 'buy' | 'sell'
  qty: number
  estimatedCost: number
  fillPrice: number
  req: OrderRequest
}

export default function OrderEntry({ prefill, onOrderPlaced }: Props) {
  const [symbol, setSymbol] = useState('SPY')
  const [expiry, setExpiry] = useState('')
  const [strike, setStrike] = useState('')
  const [optionType, setOptionType] = useState<'call' | 'put'>('call')
  const [action, setAction] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('1')
  const [bidPrice, setBidPrice] = useState(0)
  const [askPrice, setAskPrice] = useState(0)
  const [fillPriceInput, setFillPriceInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ success: boolean; msg: string } | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmState | null>(null)

  useEffect(() => {
    if (prefill) {
      setSymbol(prefill.symbol)
      setExpiry(prefill.expiry)
      setStrike(String(prefill.strike))
      setOptionType(prefill.option_type)
      setBidPrice(prefill.bid)
      setAskPrice(prefill.ask)
      const suggested = action === 'buy' ? prefill.ask : prefill.bid
      setFillPriceInput(suggested > 0 ? fmt(suggested) : '')
      setFeedback(null)
    }
  }, [prefill])

  const strikeNum = parseFloat(strike) || 0
  const qty = parseInt(quantity) || 1
  const midPrice = bidPrice > 0 && askPrice > 0 ? (bidPrice + askPrice) / 2 : 0
  const parsedFillPrice = parseFloat(fillPriceInput) || 0
  const fillPrice = parsedFillPrice > 0 ? parsedFillPrice : (action === 'buy' ? askPrice : bidPrice)
  const estimatedCost = fillPrice > 0 ? fillPrice * qty * 100 : 0

  const handleSubmit = () => {
    if (!symbol || !expiry || !strikeNum || qty <= 0) {
      setFeedback({ success: false, msg: 'Please fill in all fields.' })
      return
    }
    const req: OrderRequest = {
      symbol,
      expiry,
      strike: strikeNum,
      option_type: optionType,
      action,
      quantity: qty,
      price: parsedFillPrice > 0 ? parsedFillPrice : undefined,
    }
    setPendingConfirm({ symbol, expiry, strike: strikeNum, optionType, action, qty, estimatedCost, fillPrice, req })
  }

  const handleConfirm = async () => {
    if (!pendingConfirm) return
    const { req } = pendingConfirm
    setPendingConfirm(null)
    setSubmitting(true)
    setFeedback(null)
    try {
      const order = await placeOrder(req)
      if (order.status === 'filled') {
        setFeedback({
          success: true,
          msg: `Filled: ${order.action.toUpperCase()} ${order.quantity}x ${order.symbol} $${order.strike} ${order.option_type.toUpperCase()} @ $${fmt(order.price)}`,
        })
        onOrderPlaced()
      } else if (order.status === 'rejected') {
        setFeedback({ success: false, msg: 'Order rejected — insufficient funds.' })
      } else {
        setFeedback({ success: false, msg: `Order status: ${order.status}` })
      }
    } catch (e: any) {
      setFeedback({ success: false, msg: e?.response?.data?.detail || e?.message || 'Order failed' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {pendingConfirm && (
        <div style={modalOverlayStyle} onClick={() => setPendingConfirm(null)}>
          <div style={modalBoxStyle} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.border}`, paddingBottom: '12px' }}>
              Confirm Order
            </div>
            <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.6 }}>
              You're about to{' '}
              <strong style={{ color: pendingConfirm.action === 'buy' ? C.green : C.red }}>
                {pendingConfirm.action.toUpperCase()}
              </strong>{' '}
              {pendingConfirm.qty} contract{pendingConfirm.qty > 1 ? 's' : ''} of{' '}
              <strong>{pendingConfirm.symbol}</strong> ${pendingConfirm.strike}{' '}
              {pendingConfirm.optionType.toUpperCase()} expiring{' '}
              <strong>{pendingConfirm.expiry}</strong> at{' '}
              <strong style={{ color: C.accent }}>${fmt(pendingConfirm.fillPrice)}</strong> per contract.
            </div>
            <div style={{
              background: '#0f2d1a',
              border: `1px solid ${C.green}44`,
              borderRadius: '8px',
              padding: '10px 14px',
            }}>
              <div style={{ fontSize: '10px', color: C.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Estimated {pendingConfirm.action === 'buy' ? 'Cost' : 'Credit'}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: pendingConfirm.action === 'buy' ? C.red : C.green, fontVariantNumeric: 'tabular-nums' }}>
                {pendingConfirm.estimatedCost > 0 ? `$${fmt(pendingConfirm.estimatedCost)}` : '—'}
              </div>
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>
                {pendingConfirm.qty} contract{pendingConfirm.qty > 1 ? 's' : ''} × ${fmt(pendingConfirm.fillPrice)} × 100
              </div>
            </div>
            <div style={{ fontSize: '12px', color: C.muted, lineHeight: 1.5 }}>
              Paper trading order — recorded at your specified fill price.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setPendingConfirm(null)}
                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', background: pendingConfirm.action === 'buy' ? C.green : C.red, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
              >
                Confirm {pendingConfirm.action === 'buy' ? 'Buy' : 'Sell'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.panel}>
        <div style={styles.title}>Order Entry</div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Symbol</label>
          <input style={styles.input} value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="SPY" />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Expiry</label>
          <input style={styles.input} value={expiry} onChange={e => setExpiry(e.target.value)} placeholder="YYYY-MM-DD" />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Strike</label>
          <input style={styles.input} value={strike} onChange={e => setStrike(e.target.value)} placeholder="500.00" type="number" step="0.5" />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Type</label>
          <div style={styles.toggleRow}>
            <button style={styles.toggleBtn(optionType === 'call', 'call')} onClick={() => setOptionType('call')}>Call</button>
            <button style={styles.toggleBtn(optionType === 'put', 'put')} onClick={() => setOptionType('put')}>Put</button>
          </div>
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Action</label>
          <div style={styles.toggleRow}>
            <button style={styles.toggleBtn(action === 'buy', 'buy')} onClick={() => setAction('buy')}>Buy</button>
            <button style={styles.toggleBtn(action === 'sell', 'sell')} onClick={() => setAction('sell')}>Sell</button>
          </div>
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Quantity (Contracts)</label>
          <input style={styles.input} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="1" type="number" min="1" step="1" />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Fill Price (per contract)</label>
          <input
            style={styles.input}
            value={fillPriceInput}
            onChange={e => setFillPriceInput(e.target.value)}
            placeholder={midPrice > 0 ? fmt(midPrice) : '0.00'}
            type="number"
            step="0.01"
            min="0"
          />
          {bidPrice > 0 && askPrice > 0 && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <button onClick={() => setFillPriceInput(fmt(bidPrice))} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #3a3f5c', background: C.surface, color: C.muted, cursor: 'pointer' }}>Bid {fmt(bidPrice)}</button>
              <button onClick={() => setFillPriceInput(fmt(midPrice))} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #3a3f5c', background: C.surface, color: C.muted, cursor: 'pointer' }}>Mid {fmt(midPrice)}</button>
              <button onClick={() => setFillPriceInput(fmt(askPrice))} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #3a3f5c', background: C.surface, color: C.muted, cursor: 'pointer' }}>Ask {fmt(askPrice)}</button>
            </div>
          )}
        </div>

        <div style={styles.divider} />

        <div style={styles.estimateBox}>
          <span style={styles.estimateLabel}>Estimated {action === 'buy' ? 'Cost' : 'Credit'}</span>
          <span style={{ ...styles.estimateValue, color: action === 'buy' ? '#ef4444' : '#22c55e' }}>
            {estimatedCost > 0 ? `$${fmt(estimatedCost)}` : '—'}
          </span>
          {fillPrice > 0 && (
            <span style={styles.estimateSub}>
              {qty} contract{qty > 1 ? 's' : ''} x ${fmt(fillPrice)} x 100 shares
            </span>
          )}
          {bidPrice > 0 && askPrice > 0 && (
            <span style={styles.estimateSub}>
              Bid: ${fmt(bidPrice)} / Ask: ${fmt(askPrice)} / Mid: ${fmt(midPrice)}
            </span>
          )}
        </div>

        <button
          style={{ ...styles.submitBtn(action), opacity: submitting ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Placing...' : `${action === 'buy' ? 'Buy' : 'Sell'} ${qty} Contract${qty > 1 ? 's' : ''}`}
        </button>

        {feedback && (
          <div style={styles.feedback(feedback.success)}>
            {feedback.msg}
          </div>
        )}
      </div>
    </>
  )
}
