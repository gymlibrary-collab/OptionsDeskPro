import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { signInWithGoogle, loading } = useAuth()

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <span style={styles.logoIcon}>⬡</span>
          <span style={styles.logoText}>OptionsDesk</span>
        </div>

        <p style={styles.tagline}>Intelligent options trading powered by tastylive strategies</p>

        <div style={styles.divider} />

        <button
          style={styles.googleBtn}
          onClick={signInWithGoogle}
          disabled={loading}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 48 48"
            style={{ marginRight: '10px', flexShrink: 0 }}
          >
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          {loading ? 'Connecting…' : 'Sign in with Google'}
        </button>

        <p style={styles.footer}>Access by invitation only — contact admin to request access</p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#0f1117',
    padding: '20px',
  },
  card: {
    background: '#1a1d27',
    border: '1px solid #2d3148',
    borderRadius: '16px',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0',
    boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  logoIcon: {
    fontSize: '32px',
    color: '#7c6af7',
  },
  logoText: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#7c6af7',
    letterSpacing: '-0.5px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
  tagline: {
    fontSize: '13px',
    color: '#64748b',
    margin: '0 0 24px 0',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
  divider: {
    width: '100%',
    height: '1px',
    background: '#2d3148',
    marginBottom: '24px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: '1.6',
    margin: '0 0 32px 0',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    padding: '12px 20px',
    background: '#fff',
    color: '#1a1d27',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
    transition: 'opacity 0.15s',
    marginBottom: '24px',
  },
  footer: {
    fontSize: '12px',
    color: '#475569',
    margin: '0',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', monospace",
  },
}
