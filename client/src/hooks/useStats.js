import { useState, useEffect, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || '';

export function useStats() {
  const [analytics, setAnalytics] = useState({
    uniqueBlockedIps: 0,
    totalBlocks: 0,
    topBlockedEndpoints: [],
  });
  const [plans, setPlans] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshStats = useCallback(async () => {
    try {
      const [analyticsRes, plansRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/analytics`),
        fetch(`${API_BASE}/api/admin/plans`),
        fetch(`${API_BASE}/api/admin/blocked`),
      ]);

      if (!analyticsRes.ok || !plansRes.ok || !logsRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const [analyticsData, plansData, logsData] = await Promise.all([
        analyticsRes.json(),
        plansRes.json(),
        logsRes.json(),
      ]);
      setAnalytics(analyticsData);
      setPlans(plansData);
      setLogs(logsData.items || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePlanConfig = useCallback(async (planName, updates, apiKey = '') => {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const res = await fetch(`${API_BASE}/api/admin/plans/${planName}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `HTTP ${res.status}: Failed to update plan`);
    }

    await refreshStats();
  }, [refreshStats]);

  const resetIp = useCallback(async (ip, apiKey = '') => {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const res = await fetch(`${API_BASE}/api/admin/reset-ip`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ip }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `HTTP ${res.status}: Failed to reset IP`);
    }

    await refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    let timerId;
    let isMounted = true;

    async function poll() {
      await refreshStats();
      if (isMounted) {
        timerId = setTimeout(poll, 5000);
      }
    }

    poll();

    return () => {
      isMounted = false;
      clearTimeout(timerId);
    };
  }, [refreshStats]);

  return {
    analytics,
    plans,
    logs,
    loading,
    error,
    refreshStats,
    updatePlanConfig,
    resetIp,
  };
}
