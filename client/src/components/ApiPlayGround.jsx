import { useState } from "react";

const API_BASE = 'http://localhost:3000';

export function ApiPlayground({ onAction }) {
  const [loading, setLoading] = useState(false);
  const [lastResponse, setLastResponse]  = useState(null);

  async function sendRequest(endpoint, method = 'GET', body = null) {
    setLoading(true);
    const start = performance.now();

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });

      const duration = Math.round(performance.now() - start);
      const data = await res.json().catch(() => ({}));

      setLastResponse({
        endpoint, 
        status: res.status,
        statusText: res.statusText || (res.status === 429 ? 'Too Many Requests' : 'OK'),
        remaining: res.headers.get('X-RateLimit-Remaining'),
        limit: res.headers.get('X-RateLimit-Limit'),
        retryAfter: res.headers.get('Retry-After'),
        duration,
        data,
      });

      if (onAction) onAction();
    } catch (error) {
      setLastResponse({
        endpoint,
        status: 0,
        statusText: 'Network Error',
        data: { error: error.message},
      });
    } finally {
      setLoading(false);
    }
  }

  async function spamBurst(endpoint, method = 'GET') {
    for (let i = 0; i < 7; i++) {
      await sendRequest(endpoint, method);
    }
  }

  return (
    <div style={cardStyle}>
      <h3 style={{marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px'}}>🎮 API Playground</h3>
      <p style={{color: '#94a3b8', fontSize: '0.875rem' }}>Fire requests against each algorithm endpoint to test how the middleware responds:</p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <button style={btnStyle} onClick={() => sendRequest('/api/ping')} disabled={loading}>
          Ping (No Limit)
        </button>
        <button style={btnStyle} onClick={() => sendRequest('/api/data')} disabled={loading}>
          Fixed Window (/api/data)
        </button>
        <button style={btnStyle} onClick={() => sendRequest('/api/submit', 'POST', { test: true })} disabled={loading}>
          Sliding Window (/api/submit)
        </button>
        <button style={btnStyle} onClick={() => sendRequest('/api/token')} disabled={loading}>
          Token Bucket (/api/token)
        </button>
        <button 
          style={{ ...btnStyle, background: '#ef4444', color: 'white', fontWeight: 600 }}
          onClick={() => spamBurst('/api/data')} 
          disabled={loading}
        >
          ⚡ Burst Test (Spam 7x)
        </button>
      </div>

      {lastResponse && (
        <div style={{
          padding: '14px',
          borderRadius: '6px',
          backgroundColor: lastResponse.status === 429 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          border: `1px solid ${lastResponse.status === 429 ? '#ef4444' : '#22c55e'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{lastResponse.endpoint}</span>
            <span style={{ 
              fontWeight: 700, 
              color: lastResponse.status === 429 ? '#f87171' : '#4ade80',
              fontFamily: 'monospace'
            }}>
              {lastResponse.status} {lastResponse.statusText} ({lastResponse.duration}ms)
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#cbd5e1', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {lastResponse.remaining !== null && (
              <span>Remaining: <strong>{lastResponse.remaining}</strong></span>
            )}
            {lastResponse.limit !== null && (
              <span>Limit: <strong>{lastResponse.limit}</strong></span>
            )}
            {lastResponse.retryAfter && (
              <span style={{ color: '#fca5a5' }}>
                Retry-After: <strong>{lastResponse.retryAfter}s</strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  background: '#1e293b',
  padding: '20px',
  borderRadius: '10px',
  border: '1px solid #334155',
  color: '#f8fafc',
  marginBottom: '20px',
};

const btnStyle = {
  padding: '8px 14px',
  borderRadius: '6px',
  border: '1px solid #475569',
  background: '#334155',
  color: '#f8fafc',
  cursor: 'pointer',
  fontSize: '0.875rem',
  transition: 'all 0.15s ease',
};
