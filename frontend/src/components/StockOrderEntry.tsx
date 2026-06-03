import React, { useState, useEffect, useRef } from 'react'
import { getQuote, placeStockOrder, getStockOrders, StockOrder } from '../api/client'

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

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function fmtTime(ts: string) {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

interface ConfirmState {
  symbol: string
  action: 'buy' | 'sell'
  quantity: number
  orderType: 'market' | 'limit'
  limitPrice: number | undefined
  price: number
  estimatedTotal: number
}

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
  zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
}
const modalBox: React.CSSProperties = {
  background: '#1a1d27', border: '1px solid #2d3148', borderRadius: '12px',
  padding: '24px', maxWidth: '420px', width: '100%',
  display: 'flex', flexDirection: 'column', gap: '16px',
  boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
}

export default function StockOrderEntry({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const [symbol, setSymbol] = useState('SPY')
  const [action, setAction] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('10')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [limitPrice, setLimitPrice] = useState('')
  const [quotePrice, setQuotePrice] = useState(0)
  const [quotePct, setQuotePct] = useState(0)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [recentOrders, setRecentOrders] = useState<StockOrder[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ success: boolean; msg: string } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchQuote = async (sym: string) => {
    if (!sym) return
    setLoadingQuote(true)
    try {
      const q = await getQuote(sym)
      setQuotePrice(q.price)
      setQuotePct(q.changePercent)
    } catch {
      setQuotePrice(0)
    } finally {
      setLoadingQuote(false)
    }
  }

  const loadOrders = async () => {
    try { setRecentOrders(await getStockOrders()) } catch {}
  }

  useEffect(() => { fetchQuote(symbol) }, [])
  useEffect(() => { loadOrders() }, [])

  const handleSymbolChange = (val: string) => {
    const s = val.toUpperCase()
    setSymbol(s)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchQuote(s), 600)
  }

  const qty = parseInt(quantity) || 0
  const fillPrice = orderType === 'limit' && limitPrice ? parseFloat(limitPrice) : quotePrice
  const estimatedTotal = fillPrice * qty

  const handleSubmit = () => {
    if (!symbol || qty <= 0) {
      setFeedback({ success: false, msg: 'Please fill in all fields.' })
      return
    }
    if (orderType === 'limit' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setFeedback({ success: false, msg: 'Enter a valid limit price.' })
      return
    }
    setConfirm({
      symbol, action, quantity: qty, orderType,
      limitPrice: limitPrice ? parseFloat(limitPrice) : undefined,
      price: fillPrice,
      estimatedTotal,
    })
  }

  const handleConfirm = async () => {
    if (!confirm) return
    setConfirm(null)
    setSubmitting(true)
    setFeedback(null)
    try {
      const order = await placeStockOrder({
        symbol: confirm.symbol,
        action: confirm.action,
        quantity: confirm.quantity,
        order_type: confirm.orderType,
        limit_price: confirm.limitPrice,
      })
      if (order.status === 'filled') {
        setFeedback({
          success: true,
          msg: `Filled: ${order.action.toUpperCase()} ${order.quantity} ${order.symbol} @ $${fmt(order.fill_price)} · Total $${fmt(order.total_value)}`,
        })
        onOrderPlaced()
        loadOrders()
      } else if (order.status === 'rejected') {
        setFeedback({ success: false, msg: 'Order rejected — insufficient funds.' })
      } else {
        setFeedback({ success: true, msg: `Order ${order.status}: ${order.symbol} ${order.action} ${order.quantity}` })
        onOrderPlaced()
        loadOrders()
      }
    } catch (e: any) {
      setFeedback({ success: false, msg: e?.response?.data?.detail || e?.message || 'Order failed' })
    } finally {
      setSubmitting(false)
    }
  }

  const toggleBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', transition: 'all 0.15s',
    background: active ? `${color}22` : C.surface,
    border: `1px solid ${active ? color : '#3a3f5c'}`,
    color: active ? color : C.muted,
  })

  const inputStyle: React.CSSProperties = {
    background: C.surface, border: '1px solid #3a3f5c', borderRadius: '6px',
    color: C.text, padding: '7px 10px', fontSize: '13px', outline: 'none', width: '100%',
  }

  return (
    <>
      {confirm && (
        <div style={modalOverlay} onClick={() => setConfirm(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: C.text, borderBottom: `1px solid ${C.border}`, paddingBottom: '12px' }}>
              Confirm Stock Order
            </div>
            <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.6 }}>
              You're about to{' '}
              <strong style={{ color: confirm.action === 'buy' ? C.green : C.red }}>
                {confirm.action.toUpperCase()}
              </strong>{' '}
              <strong>{confirm.quantity}</strong> shares of <strong>{confirm.symbol}</strong>
              {confirm.orderType === 'limit' ? ` at limit $${fmt(confirm.limitPrice!)}` : ' at market price'}.
            </div>
            <div style={{ background: '#0f2d1a', border: `1px solid ${C.green}44`, borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10px', color: C.green, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Estimated {confirm.action === 'buy' ? 'Cost' : 'Credit'}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: confirm.action === 'buy' ? C.red : C.green, fontVariantNumeric: 'tabular-nums' }}>
                {confirm.estimatedTotal > 0 ? `$${fmt(confirm.estimatedTotal)}` : '—'}
              </div>
              {confirm.price > 0 && (
                <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>
                  {confirm.quantity} shares × ${fmt(confirm.price)}
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>
              Paper trading order — simulated fill at current market price.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirm} style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', background: confirm.action === 'buy' ? C.green : C.red, color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Confirm {confirm.action === 'buy' ? 'Buy' : 'Sell'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `1px solid ${C.border}`, paddingBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: C.text, letterSpacing: '0.05em', textTransform: 'uppercase', flex: 1 }}>
            Stock Order
          </span>
          <span style={{ fontSize: '10px', background: '#1a1440', border: '1px solid #7c6af744', color: '#7c6af7', padding: '2px 7px', borderRadius: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
            Paper
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Symbol</label>
          <input style={inputStyle} value={symbol} onChange={e => handleSymbolChange(e.target.value)} placeholder="SPY" />
          {quotePrice > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <span style={{ color: C.text, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${fmt(quotePrice)}</span>
              <span style={{ color: quotePct >= 0 ? C.green : C.red, fontSize: '11px' }}>
                {quotePct >= 0 ? '+' : ''}{fmt(quotePct, 2)}%
              </span>
              {loadingQuote && <span style={{ color: C.muted, fontSize: '11px' }}>updating…</span>}
            </div>
          )}
          {loadingQuote && quotePrice === 0 && <span style={{ fontSize: '11px', color: C.muted }}>Loading quote…</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Action</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={toggleBtn(action === 'buy', C.green)} onClick={() => setAction('buy')}>Buy</button>
            <button style={toggleBtn(action === 'sell', C.red)} onClick={() => setAction('sell')}>Sell</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Quantity (Shares)</label>
          <input style={inputStyle} value={quantity} onChange={e => setQuantity(e.target.value)} type="number" min="1" step="1" placeholder="10" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Order Type</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={toggleBtn(orderType === 'market', C.accent)} onClick={() => setOrderType('market')}>Market</button>
            <button style={toggleBtn(orderType === 'limit', C.accent)} onClick={() => setOrderType('limit')}>Limit</button>
          </div>
        </div>

        {orderType === 'limit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Limit Price</label>
            <input style={inputStyle} value={limitPrice} onChange={e => setLimitPrice(e.target.value)} type="number" step="0.01" placeholder={quotePrice > 0 ? fmt(quotePrice) : '0.00'} />
          </div>
        )}

        <div style={{ borderTop: `1px solid ${C.border}`, margin: '0 -16px' }} />
        <div style={{ background: C.surface, border: '1px solid #3a3f5c', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Estimated {action === 'buy' ? 'Cost' : 'Credit'}
          </span>
          <span style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: action === 'buy' ? C.red : C.green }}>
            {estimatedTotal > 0 ? `$${fmt(estimatedTotal)}` : '—'}
          </span>
          {fillPrice > 0 && qty > 0 && (
            <span style={{ fontSize: '11px', color: C.muted }}>
              {qty} shares × ${fmt(fillPrice)}{orderType === 'market' ? ' (market)' : ' (limit)'}
            </span>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            padding: '12px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 700,
            cursor: submitting ? 'default' : 'pointer', width: '100%',
            background: action === 'buy' ? C.green : C.red,
            color: '#fff', opacity: submitting ? 0.6 : 1,
            letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'opacity 0.15s',
          }}
        >
          {submitting ? 'Placing…' : `${action === 'buy' ? 'Buy' : 'Sell'} ${qty > 0 ? qty : ''} Shares`}
        </button>

        {feedback && (
          <div style={{ padding: '10px', borderRadius: '6px', fontSize: '12px', background: feedback.success ? '#0f2d1a' : '#2d0f0f', border: `1px solid ${feedback.success ? C.green : C.red}`, color: feedback.success ? C.green : C.red }}>
            {feedback.msg}
          </div>
        )}

        {recentOrders.length > 0 && (
          <>
            <div style={{ borderTop: `1px solid ${C.border}`, margin: '0 -16px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Recent Fills</span>
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {recentOrders.slice(0, 10).map(o => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 0', borderBottom: `1px solid ${C.border}`, fontSize: '11px' }}>
                    <span style={{ color: o.action === 'buy' ? C.green : C.red, fontWeight: 700, minWidth: '28px', textTransform: 'uppercase' }}>{o.action}</span>
                    <span style={{ color: C.text, fontWeight: 600, minWidth: '36px' }}>{o.symbol}</span>
                    <span style={{ color: C.muted }}>{o.quantity} sh</span>
                    <span style={{ color: C.muted, marginLeft: 'auto' }}>@${fmt(o.fill_price)}</span>
                    <span style={{ color: o.status === 'filled' ? C.green : C.red, minWidth: '20px', textAlign: 'right' }}>{fmtTime(o.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
