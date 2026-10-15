export function getAlgoBadgeStyle(algorithm) {
  const colors = {
    fixed: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa', border: '#3b82f6' },
    sliding: { bg: 'rgba(168, 85, 247, 0.2)', text: '#c084fc', border: '#a855f7' },
    token: { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24', border: '#f59e0b' },
  };
  const c = colors[algorithm] || { bg: '#334155', text: '#cbd5e1', border: '#64748b' };
  return {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 600,
    background: c.bg,
    color: c.text,
    border: `1px solid ${c.border}`,
  };
}

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
    marginBottom: '14px',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  statusBadge: (isConnected) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.75rem',
    padding: '3px 8px',
    borderRadius: '12px',
    background: isConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
    color: isConnected ? '#4ade80' : '#f87171',
    border: `1px solid ${isConnected ? '#22c55e' : '#ef4444'}`,
    fontWeight: 600,
  }),
  statusDot: (isConnected) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: isConnected ? '#22c55e' : '#ef4444',
  }),
  clearBtn: {
    background: 'transparent',
    border: '1px solid #475569',
    color: '#94a3b8',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  subtext: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    marginTop: 0,
    marginBottom: '16px',
  },
  empty: {
    padding: '30px',
    textAlign: 'center',
    background: 'rgba(15, 23, 42, 0.5)',
    borderRadius: '8px',
    border: '1px dashed #334155',
    color: '#94a3b8',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  list: {
    maxHeight: '280px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  eventRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: '#0f172a',
    borderRadius: '6px',
    border: '1px solid #334155',
    flexWrap: 'wrap',
    gap: '8px',
  },
  blockBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 700,
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#f87171',
    border: '1px solid #ef4444',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '0.8rem',
    color: '#94a3b8',
  },
};


export function LiveFeed({ events, isConnected, onClear }) {
  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <h3 style={{ margin: 0 }}>📡 Live Event Stream</h3>
          <span style={styles.statusBadge(isConnected)}>
            <span style={styles.statusDot(isConnected)} />
            {isConnected ? 'LIVE' : 'DISCONNECTED'}
          </span>
        </div>

        {events.length > 0 && (
          <button style={styles.clearBtn} onClick={onClear}>
            Clear ({events.length})
          </button>
        )}
      </div>

      <p style={styles.subtext}>
        Real-time 429 blocked events pushed via Redis Pub/Sub → WebSocket:
      </p>

      {events.length === 0 ? (
        <div style={styles.empty}>
          <span>💤 No blocked requests yet.</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
              Click Burst Test in the playground to watch live blocks appear!
            </span>
        </div>
      ) : (
        <div style={styles.list}>
          {events.map((evt, idx) => (
            <div key={idx} style={styles.eventRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={styles.blockBadge}>429</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#f1f5f9' }}>
                  {evt.endpoint}
                </span>
                <span style={getAlgoBadgeStyle(evt.algorithm)}>
                  {evt.algorithm}
                </span>
              </div>

              <div style={styles.meta}>
                <span style={{ fontFamily: 'monospace' }}>IP: {evt.ip}</span>
                <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
