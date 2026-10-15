import { useState } from 'react';

export const styles = {
  card: {
    background: '#1e293b',
    padding: '20px',
    borderRadius: '10px',
    border: '1px solid #334155',
    color: '#f8fafc',
    marginBottom: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  subtext: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginTop: 0,
    marginBottom: '16px',
  },
  form: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  input: {
    background: '#0f172a',
    border: '1px solid #475569',
    borderRadius: '6px',
    padding: '10px 14px',
    color: '#f8fafc',
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    flex: '1',
    minWidth: '220px',
    outline: 'none',
  },
  btn: {
    padding: '10px 18px',
    borderRadius: '6px',
    border: 'none',
    background: '#10b981',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  status: (isError) => ({
    marginTop: '10px',
    fontSize: '0.8rem',
    color: isError ? '#f87171' : '#34d399',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  }),
  queueFlow: {
    marginTop: '16px',
    padding: '12px',
    background: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '6px',
    border: '1px solid #334155',
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
};

export function QuickUnblock({ onResetIp }) {
  const [ip, setIp] = useState('::1');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleReset(e) {
    e.preventDefault();
    if (!ip.trim()) return;

    setLoading(true);
    setStatus(null);

    try {
      await onResetIp(ip.trim());
      setStatus({ message: `🧹 Reset job enqueued for IP: ${ip}`, isError: false });
      setTimeout(() => setStatus(null), 4000);
    } catch (err) {
      setStatus({ message: err.message, isError: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={{ margin: 0 }}>🧹 Quick Unblock / Reset IP (Redis Lists Queue)</h3>
      </div>
      <p style={styles.subtext}>
        Dispatches a background cleanup job to the Redis List (<code style={{ color: '#10b981' }}>LPUSH / BRPOP</code>). The worker deletes all active window keys for this IP using <code style={{ color: '#10b981' }}>scanStream</code>:
      </p>

      <form onSubmit={handleReset} style={styles.form}>
        <input
          type="text"
          placeholder="Enter IP (e.g. ::1 or 192.168.1.1)"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.btn} disabled={loading || !ip.trim()}>
          {loading ? 'Enqueuing Job...' : 'Unblock IP'}
        </button>
      </form>

      {status && (
        <div style={styles.status(status.isError)}>
          {status.message}
        </div>
      )}

      <div style={styles.queueFlow}>
        Flow: Browser → POST /api/admin/reset-ip → LPUSH rl:queue:jobs → Worker BRPOP → scanStream & DEL
      </div>
    </div>
  );
}
