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
  plansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
  },
  planCard: {
    background: '#0f172a',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  planCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: {
    textTransform: 'uppercase',
    fontWeight: 700,
    letterSpacing: '0.05em',
    fontSize: '0.95rem',
  },
  algoBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 600,
    background: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
    border: '1px solid #0284c7',
  },
  fieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldLabel: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontWeight: 600,
  },
  input: {
    background: '#1e293b',
    border: '1px solid #475569',
    borderRadius: '6px',
    padding: '6px 10px',
    color: '#f8fafc',
    fontSize: '0.875rem',
    outline: 'none',
  },
  saveBtn: {
    marginTop: 'auto',
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    background: '#0284c7',
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  statusText: (isError) => ({
    fontSize: '0.75rem',
    color: isError ? '#f87171' : '#4ade80',
    textAlign: 'center',
  }),
};

function PlanTierCard({ planName, config, onSave }) {
  const [maxRequests, setMaxRequests] = useState(config.maxRequests || '');
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  async function handleSave() {
    setSaving(true);
    setStatusMsg(null);
    try {
      await onSave(planName, { maxRequests: Number(maxRequests) });
      setStatusMsg({ text: 'Updated in Redis!', isError: false });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      setStatusMsg({ text: err.message, isError: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.planCard}>
      <div style={styles.planCardHeader}>
        <span style={styles.planName}>{planName}</span>
        <span style={styles.algoBadge}>{config.algorithm}</span>
      </div>

      <div style={styles.fieldRow}>
        <label style={styles.fieldLabel}>MAX REQUESTS (IN REDIS HASH):</label>
        <input
          type="number"
          min="1"
          style={styles.input}
          value={maxRequests}
          onChange={(e) => setMaxRequests(e.target.value)}
        />
      </div>

      <div style={styles.fieldRow}>
        <label style={styles.fieldLabel}>WINDOW SIZE:</label>
        <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
          {(config.windowMs / 1000) || 60} seconds
        </div>
      </div>

      <button
        style={styles.saveBtn}
        onClick={handleSave}
        disabled={saving || Number(maxRequests) === config.maxRequests}
      >
        {saving ? 'Updating Redis...' : 'Save to Redis Hash'}
      </button>

      {statusMsg && (
        <span style={styles.statusText(statusMsg.isError)}>
          {statusMsg.text}
        </span>
      )}
    </div>
  );
}

export function ConfigPanel({ plans = {}, onUpdatePlan }) {
  const planEntries = Object.entries(plans);

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={{ margin: 0 }}>⚙️ Plan Config Manager (Redis Hashes)</h3>
      </div>
      <p style={styles.subtext}>
        Dynamic rate limits stored in Redis Hashes (<code style={{ color: '#38bdf8' }}>HSET / HGETALL</code>). Updates apply at runtime without redeploying:
      </p>

      {planEntries.length === 0 ? (
        <div style={{color: '#64748b', fontSize: '0.85rem'}}>
          Loading plans from Redis...
        </div>
      ) : (
        <div style={styles.plansGrid}>
          {planEntries.map(([name, config]) => (
            <PlanTierCard
              key={name}
              planName={name}
              config={config}
              onSave={onUpdatePlan}
            />
          ))}
        </div>
      )}
    </div>
  );
}
