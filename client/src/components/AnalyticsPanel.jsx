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
    marginBottom: '16px',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  dateBadge: {
    fontSize: '0.75rem',
    background: '#334155',
    color: '#94a3b8',
    padding: '3px 8px',
    borderRadius: '6px',
    fontFamily: 'monospace',
  },
  refreshBtn: {
    background: '#334155',
    border: '1px solid #475569',
    color: '#f8fafc',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '14px',
    marginBottom: '20px',
  },
  statCard: {
    background: '#0f172a',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #334155',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#94a3b8',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statValue: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: '#38bdf8',
  },
  statHelp: {
    fontSize: '0.7rem',
    color: '#64748b',
    marginTop: '4px',
  },
  sectionTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#cbd5e1',
    marginBottom: '10px',
  },
  endpointList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  endpointRow: {
    background: '#0f172a',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  endpointRowHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  endpointName: {
    fontFamily: 'monospace',
    fontWeight: 600,
    fontSize: '0.875rem',
  },
  endpointCount: {
    fontWeight: 700,
    color: '#f87171',
    fontSize: '0.875rem',
  },
  progressBarBg: {
    width: '100%',
    height: '6px',
    background: '#334155',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressBarFill: (pct) => ({
    width: `${pct}%`,
    height: '100%',
    background: 'linear-gradient(90deg, #38bdf8, #ef4444)',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  }),
  emptyText: {
    padding: '16px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.85rem',
    background: 'rgba(15, 23, 42, 0.4)',
    borderRadius: '6px',
  },
};

export function AnalyticsPanel({ analytics, loading, onRefresh }) {
  const { uniqueBlockedIps = 0, totalBlocks = 0, topBlockedEndpoints = [], date } = analytics || {};

  const maxBlocks = Math.max(...topBlockedEndpoints.map((e) => e.count), 1);

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <h3 style={{ margin: 0 }}>📊 Analytics & HyperLogLog</h3>
          {date && <span style={styles.dateBadge}>{date}</span>}
        </div>
        <button style={styles.refreshBtn} onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {/*Stat Cards: HyperLogLog Unique IPs + Total Blocks */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>
            <span>UNIQUE BLOCKED IPs</span>
            <span style={{ color: '#38bdf8', fontSize: '0.7rem' }}>HyperLogLog</span>
          </div>
          <div style={styles.statValue}>{uniqueBlockedIps}</div>
          <div style={styles.statHelp}>Redis PFCOUNT (Fixed 12 KB memory)</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>
            <span>TOTAL BLOCKS TODAY</span>
            <span style={{ color: '#f87171', fontSize: '0.7rem' }}>Counter</span>
          </div>
          <div style={{ ...styles.statValue, color: '#f87171' }}>{totalBlocks}</div>
          <div style={styles.statHelp}>Redis INCR counter</div>
        </div>
      </div>

      {/* Top Offending Endpoints */}
      <div style={styles.sectionTitle}>
        Top Blocked Endpoints (Redis Sorted Sets)
      </div>

      {topBlockedEndpoints.length === 0 ? (
        <div style={styles.emptyText}>
          No endpoint blocks recorded yet today. Use the playground to trigger rate limits!
        </div>
      ) : (
        <div style={styles.endpointList}>
          {topBlockedEndpoints.map((item, indx) => {
            const pct = Math.round((item.count / maxBlocks) * 100);
            return (
              <div key={indx} style={styles.endpointRow}>
                <div style={styles.endpointRowHeader}>
                  <span style={styles.endpointName}>{item.endpoint}</span>
                  <span style={styles.endpointCount}>{item.count} blocks</span>
                </div>
                <div style={styles.progressBarBg}>
                  <div style={styles.progressBarFill(pct)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
