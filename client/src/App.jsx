import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useStats } from './hooks/useStats';

const API_BASE = import.meta.env.VITE_API_URL || '';

const PERSONAS = [
  {
    key: 'free_test_key',
    name: 'Free Developer',
    role: 'user',
    plan: 'free',
    badge: 'FREE TIER',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    roleBadgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/[0.05] dark:text-zinc-400 dark:border-white/[0.08]',
    limitDesc: '5 req / 30s',
    algoDesc: 'Fixed Counter',
    desc: 'Standard unprivileged user. Blocked from administrative endpoints.',
    icon: 'code',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20',
  },
  {
    key: 'pro_test_key',
    name: 'Pro Startup',
    role: 'user',
    plan: 'pro',
    badge: 'PRO TIER',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20',
    roleBadgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/[0.05] dark:text-zinc-400 dark:border-white/[0.08]',
    limitDesc: '20 req / 30s',
    algoDesc: 'Sliding Window',
    desc: 'High-throughput customer tier. Blocked from administrative endpoints.',
    icon: 'rocket_launch',
    iconColor: 'text-sky-600 dark:text-cyan-400',
    iconBg: 'bg-sky-50 dark:bg-cyan-500/10 border-sky-200 dark:border-cyan-500/20',
  },
  {
    key: 'ent_test_key',
    name: 'Enterprise VIP',
    role: 'user',
    plan: 'enterprise',
    badge: 'ENTERPRISE VIP',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20',
    roleBadgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/[0.05] dark:text-zinc-400 dark:border-white/[0.08]',
    limitDesc: '100 req / min',
    algoDesc: 'Token Bucket',
    desc: 'VIP commercial account with maximum quota. Blocked from admin routes.',
    icon: 'diamond',
    iconColor: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20',
  },
  {
    key: 'adm_test_key',
    name: 'DevOps Master Admin',
    role: 'admin',
    plan: 'enterprise',
    badge: 'SYSTEM ADMIN',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    roleBadgeClass: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40 font-bold',
    limitDesc: 'Admin Access + 100 req/min',
    algoDesc: 'Full RBAC Access',
    desc: 'Full administrative rights to modify rate limit plans and unblock IPs.',
    icon: 'workspace_premium',
    iconColor: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
  },
];

const ENDPOINTS = {
  ping: { method: 'GET', path: '/api/ping', name: '/api/ping', badge: 'GET', badgeColorLight: 'text-emerald-600', badgeColorDark: 'text-emerald-400', tag: 'Bypass', desc: 'Healthcheck', body: null },
  data: { method: 'GET', path: '/api/data', name: '/api/data', badge: 'GET', badgeColorLight: 'text-sky-600', badgeColorDark: 'text-cyan-400', tag: 'Fixed Counter', desc: 'Tier Rate Limiter', body: null },
  submit: { method: 'POST', path: '/api/submit', name: '/api/submit', badge: 'POST', badgeColorLight: 'text-amber-600', badgeColorDark: 'text-amber-400', tag: 'Sliding ZSET', desc: 'Tier Rate Limiter', body: { test: true } },
  token: { method: 'GET', path: '/api/token', name: '/api/token', badge: 'GET', badgeColorLight: 'text-sky-600', badgeColorDark: 'text-cyan-400', tag: 'Token Bucket', desc: 'Tier Rate Limiter', body: null },
};

const NAV_ITEMS = [
  { id: 'telemetry', label: 'Live Telemetry', icon: 'monitoring' },
  { id: 'playground', label: 'API Playground', icon: 'terminal' },
  { id: 'rules', label: 'Rate Limit Rules', icon: 'tune' },
  { id: 'streams', label: 'Stream Inspection', icon: 'receipt_long' },
  { id: 'security', label: 'Security Mitigation', icon: 'gshield' },
];

function getPersonaQuota(p, plans) {
  const planConfig = plans?.[p?.plan];
  if (!planConfig) return p?.limitDesc || '5 req / min';

  const maxReq = planConfig.maxRequests ?? 5;
  const windowSec = planConfig.windowMs ? Math.round(planConfig.windowMs / 1000) : 60;
  const windowLabel = windowSec === 60 ? 'min' : windowSec >= 60 ? `${Math.round(windowSec / 60)}m` : `${windowSec}s`;

  if (p.role === 'admin') {
    return `Admin Access + ${maxReq} req / ${windowLabel}`;
  }
  return `${maxReq} req / ${windowLabel}`;
}

function formatUptime(sec) {
  if (!sec) return '0m';
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${sec % 60}s`;
}

export default function App() {
  const { isConnected, events, clearEvents } = useWebSocket();
  const { analytics, plans, logs, loading, refreshStats, updatePlanConfig, resetIp } = useStats();

  // Active persona key state
  const [activePersonaKey, setActivePersonaKey] = useState('free_test_key');
  const activePersona = PERSONAS.find((p) => p.key === activePersonaKey) || PERSONAS[0];

  // Custom Animated Persona Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  // Theme state: 'light' | 'dark'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    const favicon = document.getElementById('faviconLink');
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.className = "bg-[#0b0d12] font-sans text-zinc-300 antialiased selection:bg-cyan-500/20 selection:text-cyan-200 min-h-screen flex flex-col";
      if (favicon) favicon.href = '/logo-dark.png';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.className = "bg-[#f8fafc] font-sans text-slate-800 antialiased selection:bg-sky-100 selection:text-sky-800 min-h-screen flex flex-col";
      if (favicon) favicon.href = '/logo-light.png';
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Navigation
  const [activeTab, setActiveTab] = useState('telemetry');

  // Playground state
  const [activeEndpointKey, setActiveEndpointKey] = useState('data');
  const [inspectorTab, setInspectorTab] = useState('headers');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pingLatency, setPingLatency] = useState('0.84ms');

  // Security Unblock state
  const [targetIp, setTargetIp] = useState('::1');
  const [unblockReason, setUnblockReason] = useState('False Positive / Incident Resolve');
  const [queueCount, setQueueCount] = useState(0);

  // Stream filter state
  const [streamFilter, setStreamFilter] = useState('');
  const [isStreamCleared, setIsStreamCleared] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Local state for tier editing
  const [tierValues, setTierValues] = useState({
    freeMax: 5,
    proMax: 20,
    entMax: 100,
  });

  useEffect(() => {
    if (plans.free || plans.pro || plans.enterprise) {
      setTierValues({
        freeMax: plans.free?.maxRequests || 5,
        proMax: plans.pro?.maxRequests || 20,
        entMax: plans.enterprise?.maxRequests || 100,
      });
    }
  }, [plans]);

  // Last response state for Inspector
  const [lastResponse, setLastResponse] = useState({
    status: 'HTTP 200 READY',
    statusCode: 200,
    isError: false,
    endpoint: '/api/data',
    remaining: '5',
    limit: '5',
    clientRole: 'user',
    clientPlan: 'free',
    clientKey: 'free_test_key',
    reset: 'in 30s',
    retryAfter: '0s',
    algo: 'fixed_window_counter',
    rt: '0.8ms',
    lua: '0.12ms',
    payload: { status: 'READY', engine: 'Redis Rate Limiter', message: 'Select persona and send probe to test' },
  });

  function showToast(message, type = 'info', duration = 4000) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [
      ...prev,
      { id, message, type, exiting: false, duration },
    ]);

    setTimeout(() => {
      dismissToast(id);
    }, duration);
  }

  function dismissToast(id) {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 380);
  }

  async function executeRequest(key) {
    const ep = ENDPOINTS[key];
    setIsRequesting(true);
    const start = performance.now();

    try {
      const headers = {
        'x-api-key': activePersonaKey,
      };
      if (ep.body) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(`${API_BASE}${ep.path}`, {
        method: ep.method,
        headers,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });

      const rt = Math.round(performance.now() - start);
      const data = await res.json().catch(() => ({}));
      const isErr = res.status === 429;
      setPingLatency(`${rt}ms`);

      const rawRemaining = res.headers.get('X-RateLimit-Remaining');
      const payloadRemaining = data?.rateLimit?.remaining !== undefined ? String(data.rateLimit.remaining) : (data?.remaining !== undefined ? String(data.remaining) : undefined);
      const remainingVal = rawRemaining !== null && rawRemaining !== undefined
        ? rawRemaining
        : (payloadRemaining !== undefined ? payloadRemaining : (isErr ? '0' : '0'));

      const rawLimit = res.headers.get('X-RateLimit-Limit');
      const payloadLimit = data?.rateLimit?.limit !== undefined ? String(data.rateLimit.limit) : (data?.quota !== undefined ? String(data.quota) : undefined);
      const limitVal = rawLimit || payloadLimit || (activePersona.plan === 'enterprise' ? '100' : activePersona.plan === 'pro' ? '20' : '5');

      const rawRole = res.headers.get('X-Client-Role') || data?.user?.role || activePersona.role;
      const rawPlan = res.headers.get('X-Client-Plan') || data?.user?.plan || activePersona.plan;
      const rawKey = res.headers.get('X-Client-Key') || data?.user?.key || activePersona.key;
      const rawAlgo = res.headers.get('X-Redis-Algorithm') || (data?.rateLimit?.algorithm ? `${data.rateLimit.algorithm}_algorithm` : (ep.tag.includes('ZSET') ? 'sliding_window_zset' : ep.tag.includes('Token') ? 'token_bucket_hash' : 'fixed_window_counter'));
      const rawLatency = res.headers.get('X-RateLimit-Latency-Ms') || (data?.rateLimit?.latencyMs ? `${data.rateLimit.latencyMs}` : (rt > 0 ? (rt * 0.12).toFixed(2) : '0.15'));
      const rawRetry = res.headers.get('Retry-After') || (data?.retryAfter ? String(Math.ceil(data.retryAfter / 1000)) : '0');

      setLastResponse({
        status: `HTTP ${res.status} ${res.statusText || (res.status === 200 ? 'OK' : isErr ? 'RATE LIMITED' : 'ERROR')}`,
        statusCode: res.status,
        isError: res.status >= 400,
        endpoint: ep.path,
        remaining: remainingVal,
        limit: limitVal,
        clientRole: rawRole,
        clientPlan: rawPlan,
        clientKey: rawKey,
        reset: rawRetry !== '0' ? `in ${rawRetry}s` : 'in 30s',
        retryAfter: rawRetry !== '0' ? `${rawRetry}s` : '0s',
        algo: rawAlgo,
        rt: `${rt}ms`,
        lua: `${rawLatency}ms`,
        payload: data,
      });

      if (isErr) {
        showToast(`Rate limit exceeded on ${ep.name} (429 Blocked for [${activePersona.name}])`, 'error');
      } else {
        showToast(`Probe sent -> ${ep.name} (200 OK as [${activePersona.name}])`, 'success');
      }

      refreshStats();
    } catch (err) {
      setLastResponse((prev) => ({
        ...prev,
        status: 'NETWORK ERROR',
        isError: true,
        payload: { error: err.message },
      }));
      showToast(`Network error: ${err.message}`, 'error');
    } finally {
      setIsRequesting(false);
    }
  }

  async function handleBurstSpam() {
    const ep = ENDPOINTS[activeEndpointKey];
    showToast(`Blasting 7x concurrent requests to ${ep.name} as [${activePersona.name}]...`, 'info');
    await Promise.all([
      executeRequest(activeEndpointKey),
      executeRequest(activeEndpointKey),
      executeRequest(activeEndpointKey),
      executeRequest(activeEndpointKey),
      executeRequest(activeEndpointKey),
      executeRequest(activeEndpointKey),
      executeRequest(activeEndpointKey),
    ]);
    refreshStats();
  }

  async function handleSaveTier(tierKey, planName, val) {
    try {
      await updatePlanConfig(planName, { maxRequests: Number(val) }, activePersonaKey);
      showToast(`HSET committed tier [${planName.toUpperCase()}] config to Redis.`, 'success');
    } catch (err) {
      showToast(`RBAC Error: ${err.message}`, 'error');
    }
  }

  async function handleEnqueueUnblock() {
    const ip = targetIp.trim() || '::1';
    setQueueCount((c) => c + 1);
    try {
      await resetIp(ip, activePersonaKey);
      showToast(`LPUSH unblock_queue "${ip}" OK. Worker picked up task.`, 'success');
    } catch (err) {
      showToast(`RBAC Error: ${err.message}`, 'error');
    } finally {
      setTimeout(() => setQueueCount((c) => Math.max(0, c - 1)), 2000);
    }
  }

  useEffect(() => {
    if (events.length > 0) {
      setIsStreamCleared(false);
    }
  }, [events]);

  function handleClearStream() {
    clearEvents();
    setIsStreamCleared(true);
    showToast('Live Pub/Sub stream buffer cleared.', 'info');
  }

  const displayEvents = isStreamCleared
    ? []
    : events.length > 0
    ? events
    : logs.map((l) => ({
        endpoint: l.endpoint || '/api/submit',
        ip: l.ip || '::1',
        algorithm: l.algorithm || 'sliding_window',
        timestamp: l.blockedAt ? new Date(l.blockedAt).getTime() : Date.now(),
        type: 'BLOCKED',
      }));

  const filteredLogs = logs.filter((l) => {
    if (!streamFilter.trim()) return true;
    const q = streamFilter.toLowerCase();
    return (l.ip && l.ip.toLowerCase().includes(q)) || (l.endpoint && l.endpoint.toLowerCase().includes(q));
  });

  const topEndpoints = analytics.topBlockedEndpoints || [];
  const maxBlocks = Math.max(...topEndpoints.map((e) => e.count), 1);
  const sys = analytics.system || {};

  return (
    <div className="bg-[#f8fafc] dark:bg-[#0b0d12] font-sans text-slate-800 dark:text-zinc-300 antialiased min-h-screen flex flex-col transition-colors duration-200">
      {/* Top Global Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 h-14 z-50 bg-white/95 dark:bg-[#0b0d12]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.07] px-4 flex items-center justify-between shadow-xs transition-colors duration-200">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('telemetry')}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden transition-transform hover:scale-105 shrink-0">
              <img
                src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
                alt="Redis Shield"
                className="w-full h-full object-contain filter drop-shadow-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white tracking-tight text-sm">Redis Shield</span>
              <span className="font-mono text-[10px] text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] px-1.5 py-0.5 rounded font-medium">v{sys.redisVersion || '8.x'}-engine</span>
            </div>
          </div>
          {/* Engine Architecture Tags */}
          <div className="hidden xl:flex items-center gap-1.5 text-[11px] font-mono text-slate-600 dark:text-zinc-400 border-l border-slate-200 dark:border-white/[0.08] pl-4">
            <span className="px-2 py-0.5 bg-slate-100/80 dark:bg-white/[0.03] rounded border border-slate-200 dark:border-white/[0.04] text-slate-700 dark:text-zinc-400 font-medium hover:scale-105 hover:bg-slate-200/80 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] transition-all duration-200 cursor-default select-none">RBAC Hash</span>
            <span className="px-2 py-0.5 bg-slate-100/80 dark:bg-white/[0.03] rounded border border-slate-200 dark:border-white/[0.04] text-slate-700 dark:text-zinc-400 font-medium hover:scale-105 hover:bg-slate-200/80 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] transition-all duration-200 cursor-default select-none">ZSET Lua</span>
            <span className="px-2 py-0.5 bg-slate-100/80 dark:bg-white/[0.03] rounded border border-slate-200 dark:border-white/[0.04] text-slate-700 dark:text-zinc-400 font-medium hover:scale-105 hover:bg-slate-200/80 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] transition-all duration-200 cursor-default select-none">Token Bucket</span>
            <span className="px-2 py-0.5 bg-slate-100/80 dark:bg-white/[0.03] rounded border border-slate-200 dark:border-white/[0.04] text-slate-700 dark:text-zinc-400 font-medium hover:scale-105 hover:bg-slate-200/80 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] transition-all duration-200 cursor-default select-none">Pub/Sub</span>
            <span className="px-2 py-0.5 bg-slate-100/80 dark:bg-white/[0.03] rounded border border-slate-200 dark:border-white/[0.04] text-slate-700 dark:text-zinc-400 font-medium hover:scale-105 hover:bg-slate-200/80 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] transition-all duration-200 cursor-default select-none">HLL (12KB)</span>
            <span className="px-2 py-0.5 bg-slate-100/80 dark:bg-white/[0.03] rounded border border-slate-200 dark:border-white/[0.04] text-slate-700 dark:text-zinc-400 font-medium hover:scale-105 hover:bg-slate-200/80 dark:hover:bg-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.15] transition-all duration-200 cursor-default select-none">List Worker</span>
          </div>
        </div>

        {/* Right System Status & Persona Switcher */}
        <div className="flex items-center gap-3">
          {/* Custom Animated Persona Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="personaDropdownTrigger"
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all duration-200 shadow-xs cursor-pointer select-none ${
                isDropdownOpen
                  ? 'bg-slate-100 border-sky-400 ring-2 ring-sky-400/20 dark:bg-white/[0.08] dark:border-cyan-400 dark:ring-cyan-400/20'
                  : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] dark:border-white/[0.08] dark:hover:border-white/[0.15]'
              }`}
              title="Change Active Client Identity"
            >
              {/* Micro Persona Icon */}
              <div className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-transform duration-200 group-hover:scale-110 ${activePersona.iconBg}`}>
                <span className={`material-symbols-outlined text-[13px] ${activePersona.iconColor}`}>
                  {activePersona.icon}
                </span>
              </div>

              {/* Label & Active Name */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 hidden sm:inline tracking-wider">
                  Client:
                </span>
                <span className="text-slate-900 dark:text-zinc-100 font-semibold text-xs tracking-tight">
                  {activePersona.name}
                </span>
              </div>

              {/* Role Badge */}
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider ${activePersona.roleBadgeClass}`}>
                {activePersona.role}
              </span>

              {/* Animated Chevron Arrow */}
              <span
                className={`material-symbols-outlined text-[16px] text-slate-400 dark:text-zinc-400 transition-transform duration-200 ${
                  isDropdownOpen ? 'rotate-180 text-sky-600 dark:text-cyan-400' : 'group-hover:text-slate-700 dark:group-hover:text-zinc-200'
                }`}
              >
                expand_more
              </span>
            </button>

            {/* Animated Popover Menu */}
            {isDropdownOpen && (
              <div
                id="personaDropdownMenu"
                className="dropdown-popover-enter absolute right-0 mt-2 w-72 sm:w-80 rounded-xl bg-white/95 dark:bg-[#11141c]/95 backdrop-blur-xl border border-slate-200 dark:border-white/[0.1] shadow-2xl z-50 p-1.5 flex flex-col gap-1 overflow-hidden"
              >
                {/* Popover Header */}
                <div className="px-3 py-2 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400 dark:text-zinc-500">
                    Active Client Persona
                  </span>
                  <span className="text-[10px] font-mono text-sky-600 dark:text-cyan-400 font-medium">
                    Redis RBAC
                  </span>
                </div>

                {/* Persona Options List */}
                <div className="flex flex-col gap-1 py-1">
                  {PERSONAS.map((p) => {
                    const isSelected = activePersonaKey === p.key;
                    return (
                      <button
                        key={p.key}
                        id={`dropdown-persona-${p.key}`}
                        type="button"
                        onClick={() => {
                          setActivePersonaKey(p.key);
                          setIsDropdownOpen(false);
                          showToast(`Switched client persona to [${p.name}] (${p.role.toUpperCase()})`, 'info');
                        }}
                        className={`w-full text-left p-2 rounded-lg font-mono transition-all duration-150 flex items-center justify-between gap-2.5 group/item cursor-pointer ${
                          isSelected
                            ? 'bg-sky-50 dark:bg-cyan-500/10 border border-sky-300 dark:border-cyan-500/30 text-sky-950 dark:text-cyan-100'
                            : 'hover:bg-slate-100/80 dark:hover:bg-white/[0.04] border border-transparent text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 transition-transform duration-150 group-hover/item:scale-110 ${p.iconBg}`}
                          >
                            <span className={`material-symbols-outlined text-[15px] ${p.iconColor}`}>
                              {p.icon}
                            </span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs tracking-tight truncate">
                                {p.name}
                              </span>
                              <span className={`text-[8px] font-bold px-1 py-0.2 rounded border uppercase ${p.roleBadgeClass}`}>
                                {p.role}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                              <code className="text-slate-600 dark:text-zinc-400 font-semibold">{p.key}</code> • {getPersonaQuota(p, plans)}
                            </span>
                          </div>
                        </div>

                        {/* Active Indicator Checkmark */}
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-sky-600 dark:bg-cyan-400 text-white dark:text-zinc-950 flex items-center justify-center shrink-0 shadow-xs animate-scale-in">
                            <span className="material-symbols-outlined text-[13px] font-bold">check</span>
                          </div>
                        ) : (
                          <span className="material-symbols-outlined text-[15px] text-slate-300 dark:text-zinc-600 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            arrow_forward
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Popover Footer Info */}
                <div className="px-3 py-1.5 border-t border-slate-100 dark:border-white/[0.05] bg-slate-50/60 dark:bg-white/[0.02] rounded-b-lg flex items-center justify-between text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                  <span>Hashes: <code className="text-sky-600 dark:text-cyan-400">rl:keys:*</code></span>
                  <span>Esc to close</span>
                </div>
              </div>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-white dark:bg-white/[0.03] rounded border border-slate-200 dark:border-white/[0.07] text-xs font-mono shadow-xs">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isConnected ? 'bg-emerald-400 opacity-75' : 'bg-rose-400 opacity-75'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="text-slate-800 dark:text-zinc-200 font-medium">{isConnected ? 'WS Live' : 'Connecting...'}</span>
            <span className="text-slate-300 dark:text-zinc-600">|</span>
            <span className="text-slate-500 dark:text-zinc-400">Port 6379</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 rounded border border-emerald-200/80 dark:border-emerald-500/20 text-xs font-mono text-emerald-700 dark:text-emerald-400 font-medium shadow-xs">
            <span className="material-symbols-outlined text-[14px]">speed</span>
            <span>{sys.p99LatencyMs ?? 0.24}ms P99</span>
          </div>

          {/* Theme Switcher Toggle */}
          <button
            id="themeToggleBtn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-medium transition-all shadow-xs bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300 dark:bg-white/[0.05] dark:border-white/[0.1] dark:text-zinc-300 dark:hover:bg-white/[0.1]"
            title={`Switch to ${theme === 'dark' ? 'Light Stitch' : 'Dark Obsidian'} mode`}
          >
            <span className="material-symbols-outlined text-[15px] text-amber-500 dark:text-amber-400">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
            <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* Main Shell Container */}
      <div className="pt-14 flex flex-1">
        {/* Sticky Left Vertical Sidebar Navigation */}
        <aside className="w-60 fixed top-14 bottom-0 left-0 bg-white dark:bg-[#0e1117] border-r border-slate-200 dark:border-white/[0.07] flex flex-col justify-between p-3.5 z-40 transition-colors duration-200">
          <div className="flex flex-col gap-5">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-semibold px-2">Navigation</span>
              <nav className="mt-2 flex flex-col gap-1 relative">
                {/* Active Indicator Sliding Pill */}
                <div
                  className="nav-indicator bg-sky-50 dark:bg-white/[0.07] border border-sky-200/70 dark:border-white/[0.08]"
                  style={{
                    transform: `translateY(${NAV_ITEMS.findIndex((item) => item.id === activeTab) * 36}px)`,
                  }}
                >
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-sky-600 dark:bg-cyan-400" />
                </div>

                {NAV_ITEMS.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`nav-${item.id}`}
                      onClick={() => setActiveTab(item.id)}
                      className={`relative z-10 w-full flex items-center gap-2.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors duration-150 text-left ${
                        isActive
                          ? 'text-sky-900 dark:text-white font-semibold'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100/60 dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-[17px] transition-transform duration-200 ${isActive ? 'text-sky-600 dark:text-cyan-400 scale-110' : 'text-slate-400 dark:text-zinc-500'}`}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Persona Quick Indicator in Sidebar */}
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.05] rounded-lg p-3 flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px] text-sky-600 dark:text-cyan-400">badge</span>
                Active Persona
              </span>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100 truncate">{activePersona.name}</span>
                  <span className={`text-[9px] font-bold px-1 py-0.2 rounded border uppercase ${activePersona.roleBadgeClass}`}>
                    {activePersona.role}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 truncate">
                  Key: <code className="text-sky-700 dark:text-cyan-400">{activePersona.key}</code>
                </span>
                <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500">
                  Quota: {getPersonaQuota(activePersona, plans)}
                </span>
              </div>
            </div>
          </div>

          {/* Engine Footer in Sidebar */}
          <div className="flex flex-col gap-2 pt-3 border-t border-slate-100 dark:border-white/[0.05]">
            <div className="bg-slate-50 dark:bg-white/[0.02] rounded-lg p-2.5 border border-slate-200 dark:border-white/[0.05] flex flex-col gap-1.5 shadow-2xs">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-500 dark:text-zinc-400 font-medium">Memory Engine</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Redis {sys.redisVersion || '8.x'}</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-white/[0.07] h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-[28%] rounded-full"></div>
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                <span>RAM {sys.usedMemoryHuman || '2.1M'}</span>
                <span className="font-medium text-slate-700 dark:text-zinc-200">{sys.instantaneousOpsPerSec ?? 0} ops/s</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="pl-60 flex-1 flex flex-col bg-[#f8fafc] dark:bg-[#0b0d12] transition-colors duration-200">
          <main className="w-full max-w-[1720px] mx-auto p-5 flex flex-col gap-5">
            {/* Real Redis System Health Ribbon */}
            <section className="border-b border-slate-200 dark:border-white/[0.07] pb-4 flex flex-wrap items-center justify-between gap-y-3 bg-white dark:bg-[#11141c] p-3.5 rounded-xl border border-slate-200 dark:border-white/[0.07] shadow-xs transition-colors duration-200">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2.5 py-1 rounded-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
                  CLUSTER HEALTHY
                </span>
                <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                  Redis v{sys.redisVersion || '8.10.2'} ({sys.role || 'master'} • {sys.connectedClients ?? 1} clients)
                </span>
              </div>

              {/* Real Metric Strip */}
              <div className="flex items-center gap-6 divide-x divide-slate-200 dark:divide-white/[0.07] text-left">
                {/* Metric 1: Ingestion Rate (real ops/s) */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 font-medium tracking-wider">Ingestion Rate</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-mono font-bold text-slate-900 dark:text-white tracking-tight">
                      {sys.instantaneousOpsPerSec ?? 0}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">ops/s</span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-500/10 px-1 py-0.2 rounded">Live Engine</span>
                  </div>
                </div>

                {/* Metric 2: Total Processed Commands */}
                <div className="pl-6 flex flex-col">
                  <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 font-medium tracking-wider">Total Commands</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-mono font-bold text-slate-900 dark:text-white tracking-tight">
                      {(sys.totalCommandsProcessed ?? 0).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">ops</span>
                  </div>
                </div>

                {/* Metric 3: Memory Allocation (Real RAM + HLL size) */}
                <div className="pl-6 flex flex-col">
                  <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 font-medium tracking-wider">Memory Allocation</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-mono font-bold text-slate-900 dark:text-white tracking-tight">
                      {sys.usedMemoryHuman || '2.1M'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">12KB HLL</span>
                  </div>
                </div>

                {/* Metric 4: Real Lua Latency */}
                <div className="pl-6 flex flex-col">
                  <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-zinc-500 font-medium tracking-wider">Lua P99 Latency</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-mono font-bold text-sky-700 dark:text-cyan-400 tracking-tight">
                      {sys.p99LatencyMs ?? 0.24} ms
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">sub-ms</span>
                  </div>
                </div>

                {/* Metric 5: Uptime & Refresh Button */}
                <div className="pl-6 flex items-center gap-3">
                  <span className="hidden xl:inline-flex items-center gap-1 text-xs font-mono text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-white/[0.04] px-2 py-1 rounded-md border border-slate-200 dark:border-white/[0.08]">
                    <span className="material-symbols-outlined text-[14px] text-sky-600 dark:text-cyan-400">schedule</span>
                    {formatUptime(sys.uptimeSeconds)}
                  </span>

                  {/* Refresh Data Button */}
                  <button
                    id="refreshDataBtn"
                    onClick={() => {
                      refreshStats();
                      showToast('Live Redis telemetry refreshed.', 'info');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all shadow-xs bg-white text-slate-800 border-slate-300 hover:bg-slate-50 dark:bg-white/[0.05] dark:border-white/[0.1] dark:text-zinc-200 dark:hover:bg-white/[0.1] active:scale-[0.98]"
                    title="Refresh Redis Telemetry"
                  >
                    <span className={`material-symbols-outlined text-[15px] text-sky-600 dark:text-cyan-400 ${loading ? 'animate-spin' : ''}`}>
                      refresh
                    </span>
                    <span>Refresh Data</span>
                  </button>
                </div>
              </div>
            </section>

            {/* PAGE 1: LIVE TELEMETRY */}
            {activeTab === 'telemetry' && (
              <div className="page-fade-in grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Algorithmic Telemetry & HyperLogLog */}
                <div className="lg:col-span-6 flex flex-col gap-4 bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.07] rounded-xl p-4 shadow-xs transition-colors duration-200">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.05] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-sky-600 dark:text-cyan-400">analytics</span>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">Algorithmic Telemetry</h2>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">HLL + ZSET ANALYTICS</span>
                  </div>

                  {/* Real Metrics Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Unique Blocked IPs: Real PFCOUNT */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 uppercase font-medium">Unique Blocked IPs (24h)</span>
                      <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white tracking-tight">
                        {(analytics.uniqueBlockedIps ?? 0).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        <span className="text-sky-600 dark:text-cyan-400 font-semibold">PFCOUNT</span>
                        <span>rl:hll:blocked</span>
                      </div>
                    </div>

                    {/* Total Rate-Limit Violations */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 uppercase font-medium">Total Blocks (ZINCRBY)</span>
                      <div className="text-2xl font-mono font-bold text-rose-700 dark:text-crimson-400 tracking-tight">
                        {(analytics.totalBlocks ?? 0).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        <span className="text-rose-600 dark:text-crimson-400 font-semibold">ZCARD</span>
                        <span>rl:zset:ip_blocks</span>
                      </div>
                    </div>

                    {/* Lua P99 Benchmark */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 uppercase font-medium">Atomic Lua Overhead</span>
                      <div className="text-2xl font-mono font-bold text-sky-700 dark:text-cyan-400 tracking-tight">
                        {sys.p99LatencyMs ?? 0.24} <span className="text-sm font-normal text-slate-400 dark:text-zinc-500">ms</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">hrtime</span>
                        <span>Redis Execution</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Blocked Target Endpoints */}
                  <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.05]">
                    <div className="flex justify-between items-center text-[10px] font-mono uppercase text-slate-500 dark:text-zinc-400 font-semibold">
                      <span>Top Rate-Limited Endpoints</span>
                      <span>ZREVRANGEBYSCORE</span>
                    </div>

                    <div className="flex flex-col gap-2">
                      {topEndpoints.length > 0 ? (
                        topEndpoints.map((ep, idx) => (
                          <div key={idx} className="flex flex-col gap-1 font-mono text-xs">
                            <div className="flex justify-between items-center text-slate-700 dark:text-zinc-300">
                              <span className="font-semibold text-slate-900 dark:text-zinc-100">{ep.endpoint}</span>
                              <span className="text-slate-500 dark:text-zinc-400">{ep.count} violations</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-white/[0.05] h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-gradient-to-r from-sky-500 to-rose-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${(ep.count / maxBlocks) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs font-mono text-slate-400 dark:text-zinc-500 py-3 text-center">
                          No blocked endpoints recorded yet. Test burst traffic in the API Playground!
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pub/Sub Real-Time Attack Stream */}
                <div className="lg:col-span-6 flex flex-col h-[480px] bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.07] rounded-xl p-4 shadow-xs transition-colors duration-200">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.05] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-rose-600 dark:text-crimson-400">notifications_active</span>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">Live Redis Pub/Sub Stream</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold bg-rose-50 dark:bg-crimson-500/10 border border-rose-200 dark:border-crimson-500/20 text-rose-700 dark:text-crimson-400 px-2 py-0.5 rounded">
                        {displayEvents.length} events
                      </span>
                      <button
                        onClick={() => setIsPaused(!isPaused)}
                        className={`px-2 py-1 rounded-md border text-slate-700 font-mono text-[10px] uppercase font-semibold transition-all shadow-2xs ${
                          isPaused
                            ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:border-white/[0.08] dark:text-zinc-300'
                        }`}
                      >
                        {isPaused ? 'Resume' : 'Pause'}
                      </button>
                      <button
                        id="clearStreamBtn"
                        onClick={handleClearStream}
                        className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white font-mono text-[10px] uppercase font-semibold transition-all shadow-2xs active:scale-95"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Stream Header */}
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-mono font-semibold text-slate-500 dark:text-zinc-400 uppercase px-2 py-2 border-b border-slate-200 dark:border-white/[0.06] shrink-0 mt-1 bg-slate-50/80 dark:bg-white/[0.02] rounded-t">
                    <span className="col-span-2">Verdict</span>
                    <span className="col-span-4">Target / Engine</span>
                    <span className="col-span-3">Client Origin</span>
                    <span className="col-span-2">Timestamp</span>
                    <span className="col-span-1 text-right">Quota</span>
                  </div>

                  {/* Stream Body */}
                  <div className="flex-1 overflow-y-auto flex flex-col divide-y divide-slate-100 dark:divide-white/[0.03] pr-1">
                    {!isPaused && displayEvents.length > 0 ? (
                      displayEvents.map((evt, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center font-mono text-xs py-2 px-2 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                          <div className="col-span-2">
                            <span className="text-[9px] font-bold text-rose-700 dark:text-crimson-400 bg-rose-50 dark:bg-crimson-500/10 border border-rose-200 dark:border-crimson-500/20 px-1.5 py-0.5 rounded">
                              429 BLOCKED
                            </span>
                          </div>
                          <div className="col-span-4 flex items-center gap-1.5 truncate">
                            <span className="text-slate-900 dark:text-zinc-100 font-medium">{evt.endpoint || '/api/submit'}</span>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-500">({evt.algorithm || 'Lua'})</span>
                          </div>
                          <div className="col-span-3 truncate text-slate-700 dark:text-zinc-400 text-[11px]">{evt.ip || '::1'}</div>
                          <div className="col-span-2 text-[10px] text-slate-500 dark:text-zinc-500 font-medium">
                            {new Date(evt.timestamp || Date.now()).toTimeString().split(' ')[0]}
                          </div>
                          <div className="col-span-1 text-right text-rose-600 dark:text-crimson-400 font-bold">0</div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-xs font-mono text-slate-400 dark:text-zinc-500">
                        {isStreamCleared
                          ? 'Stream buffer cleared. Listening for live Redis Pub/Sub events on channel "rl:events"...'
                          : 'No blocked requests logged yet. Trigger traffic from the API Playground!'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PAGE 2: API PLAYGROUND */}
            {activeTab === 'playground' && (
              <div className="page-fade-in bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.07] rounded-xl p-5 flex flex-col gap-5 shadow-xs transition-colors duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.05] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-sky-600 dark:text-cyan-400">terminal</span>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">Interactive Probe & Rate Test</h2>
                  </div>
                  <span className="text-[10px] font-mono font-medium text-slate-600 dark:text-zinc-400 uppercase tracking-wider bg-slate-100 dark:bg-white/[0.05] px-2 py-0.5 rounded border border-slate-200 dark:border-white/[0.08]">
                    Live Server • Port 3000
                  </span>
                </div>

                {/* Persona & Client Identity Selector */}
                <div className="flex flex-col gap-2 bg-slate-50/70 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] rounded-xl p-4">
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-sky-600 dark:text-cyan-400">key</span>
                      Select Authenticated Client Persona (X-API-KEY)
                    </span>
                    <span>Stored in Redis Hash <code className="text-sky-700 dark:text-cyan-400">rl:keys:*</code></span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {PERSONAS.map((p) => {
                      const isSelected = activePersonaKey === p.key;
                      return (
                        <button
                          key={p.key}
                          id={`persona-${p.key}`}
                          onClick={() => {
                            setActivePersonaKey(p.key);
                            showToast(`Active persona set to [${p.name}]`, 'info');
                          }}
                          className={`text-left p-3 rounded-lg transition-all flex flex-col justify-between gap-2 shadow-xs border ${
                            isSelected
                              ? 'bg-sky-50/80 border-sky-500 text-sky-950 dark:bg-cyan-500/10 dark:border-cyan-400 dark:text-cyan-100 ring-1 ring-sky-500/30'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-white/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.05] dark:text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase ${p.roleBadgeClass}`}>
                              {p.role === 'admin' ? '👑 ' : ''}{p.role}
                            </span>
                            <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border ${p.badgeClass}`}>
                              {p.badge}
                            </span>
                          </div>

                          <div className="flex flex-col">
                            <span className={`font-semibold text-xs ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-zinc-200'}`}>
                              {p.name}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500 dark:text-zinc-400">
                              {p.key}
                            </span>
                          </div>

                          <div className="pt-1 border-t border-slate-200/50 dark:border-white/[0.05] flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-zinc-400">
                            <span>Quota:</span>
                            <span className="font-semibold text-slate-700 dark:text-zinc-300">{getPersonaQuota(p, plans)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-zinc-400 bg-white/70 dark:bg-white/[0.03] px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-white/[0.04]">
                    <span className="material-symbols-outlined text-[14px] text-sky-600 dark:text-cyan-400 shrink-0">info</span>
                    <span>
                      Active Header: <code className="text-slate-900 dark:text-zinc-100 font-semibold">x-api-key: {activePersona.key}</code> — Rate limit tier is dynamically resolved from Redis hash <code className="text-sky-700 dark:text-cyan-400 font-semibold">rl:plan:{activePersona.plan}</code>.
                    </span>
                  </div>
                </div>

                {/* Endpoint Matrix */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-zinc-400 uppercase tracking-wider font-medium">
                    <span>Target API Endpoint</span>
                    <span>Endpoint Algorithm Policy</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(ENDPOINTS).map(([key, ep]) => {
                      const isSelected = activeEndpointKey === key;
                      return (
                        <button
                          key={key}
                          id={`endpoint-${key}`}
                          onClick={() => setActiveEndpointKey(key)}
                          className={`text-left p-2.5 rounded-lg transition-all flex flex-col shadow-xs ${
                            isSelected
                              ? 'bg-sky-50 border-2 border-sky-500 text-sky-950 dark:bg-cyan-500/10 dark:border-cyan-500 dark:text-cyan-200'
                              : 'bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:bg-white/[0.02] dark:border-white/[0.07] dark:hover:bg-white/[0.05] dark:text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-mono text-[10px] font-bold ${theme === 'dark' ? ep.badgeColorDark : ep.badgeColorLight}`}>{ep.badge}</span>
                            <span className="text-[9px] font-mono text-slate-400 dark:text-zinc-500">{ep.tag}</span>
                          </div>
                          <span className={`font-mono text-xs font-semibold mt-1 ${isSelected ? 'text-sky-950 dark:text-white' : 'text-slate-800 dark:text-zinc-200'}`}>
                            {ep.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">{ep.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    id="probeBtn"
                    onClick={() => executeRequest(activeEndpointKey)}
                    disabled={isRequesting}
                    className="flex-1 min-w-[200px] bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 font-mono text-xs font-semibold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">send</span>
                    <span>Send Probe as [{activePersona.name}]</span>
                  </button>

                  <button
                    id="burstBlasterBtn"
                    onClick={handleBurstSpam}
                    disabled={isRequesting}
                    className="flex-1 min-w-[220px] bg-rose-600 hover:bg-rose-700 text-white dark:bg-crimson-600 dark:hover:bg-crimson-500 font-mono text-xs font-semibold py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">bolt</span>
                    <span>Trigger 7x Burst Blaster</span>
                  </button>
                </div>

                {/* Terminal Inspector Drawer */}
                <div className="border border-slate-200 dark:border-white/[0.07] rounded-lg p-3 bg-slate-50/70 dark:bg-[#0b0d12] flex flex-col gap-2 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/[0.06] pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold">Response Inspector</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                        lastResponse.statusCode === 200
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20'
                          : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-crimson-500/10 dark:text-crimson-300 dark:border-crimson-500/20'
                      }`}>
                        {lastResponse.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setInspectorTab('headers')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                          inspectorTab === 'headers'
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-950'
                            : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                        }`}
                      >
                        Headers
                      </button>
                      <button
                        onClick={() => setInspectorTab('body')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                          inspectorTab === 'body'
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-950'
                            : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white'
                        }`}
                      >
                        Payload
                      </button>
                    </div>
                  </div>

                  {inspectorTab === 'headers' ? (
                    <div className="flex flex-col gap-1 text-[11px]">
                      <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-white/[0.05]">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">X-Client-Role:</span>
                        <span className="text-slate-900 dark:text-white font-bold">{lastResponse.clientRole || activePersona.role}</span>
                      </div>
                      <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-white/[0.05]">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">X-Client-Plan:</span>
                        <span className="text-sky-700 dark:text-cyan-400 font-bold">{lastResponse.clientPlan || activePersona.plan}</span>
                      </div>
                      <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-white/[0.05]">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">X-Client-Key:</span>
                        <span className="text-slate-700 dark:text-zinc-300">{lastResponse.clientKey || activePersona.key}</span>
                      </div>
                      <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-white/[0.05]">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">X-RateLimit-Limit:</span>
                        <span className="text-slate-900 dark:text-zinc-200 font-bold">{lastResponse.limit}</span>
                      </div>
                      <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-white/[0.05]">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">X-RateLimit-Remaining:</span>
                        <span className={`font-bold ${Number(lastResponse.remaining) === 0 ? 'text-rose-600 dark:text-crimson-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {lastResponse.remaining}
                        </span>
                      </div>
                      <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-white/[0.05]">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">X-RateLimit-Latency-Ms:</span>
                        <span className="text-sky-700 dark:text-cyan-400 font-semibold">{lastResponse.lua} ms</span>
                      </div>
                      <div className="flex justify-between py-0.5 border-b border-slate-200/60 dark:border-white/[0.05]">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">Retry-After:</span>
                        <span className="text-amber-700 dark:text-amber-400 font-semibold">{lastResponse.retryAfter}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-slate-500 dark:text-zinc-400 font-medium">X-Redis-Algorithm:</span>
                        <span className="text-slate-800 dark:text-zinc-300">{lastResponse.algo}</span>
                      </div>
                    </div>
                  ) : (
                    <pre className="text-[11px] text-slate-800 dark:text-zinc-300 bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.07] p-2.5 rounded-md max-h-48 overflow-x-auto whitespace-pre-wrap font-mono">
                      {JSON.stringify(lastResponse.payload, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* PAGE 3: RATE LIMIT RULES */}
            {activeTab === 'rules' && (
              <div className="page-fade-in bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.07] rounded-xl p-5 flex flex-col gap-5 shadow-xs transition-colors duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.05] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-slate-600 dark:text-zinc-400">database</span>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">Dynamic Tier Manager</h2>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">HGETALL <span className="text-sky-700 dark:text-cyan-400 font-medium">rl:plan:*</span></span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded">
                    IN-MEMORY HASH
                  </span>
                </div>

                {/* RBAC Security Banner */}
                <div className={`p-3.5 rounded-lg border font-mono text-xs flex items-center justify-between gap-3 ${
                  activePersona.role === 'admin'
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-200'
                    : 'bg-amber-50/80 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[20px] shrink-0">
                      {activePersona.role === 'admin' ? 'verified_user' : 'lock'}
                    </span>
                    <div>
                      <div className="font-semibold">
                        {activePersona.role === 'admin'
                          ? '👑 Master Admin Authenticated — PATCH /api/admin/plans/* Authorized'
                          : `🔒 Protected Admin Endpoint — Current Role: ${activePersona.role.toUpperCase()}`}
                      </div>
                      <div className="text-[11px] opacity-80">
                        {activePersona.role === 'admin'
                          ? 'Modifications will be immediately committed to Redis Hashes and apply to all client requests without server restart.'
                          : `Saving plan changes requires role "admin". If you save now, RBAC middleware will reject with 403 FORBIDDEN.`}
                      </div>
                    </div>
                  </div>

                  {activePersona.role !== 'admin' && (
                    <button
                      onClick={() => {
                        setActivePersonaKey('adm_test_key');
                        showToast('Switched to DevOps Master Admin (role: admin)', 'success');
                      }}
                      className="shrink-0 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded text-[11px] shadow-xs active:scale-95 transition-all"
                    >
                      Switch to Master Admin
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  {/* Free Tier */}
                  <div className="bg-slate-50/60 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.07] rounded-lg p-4 flex flex-col justify-between gap-4 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-zinc-100">Free Tier</span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 font-medium">Fixed Window</span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 font-medium">Max Req / Window (Redis Hash)</span>
                        <div className="flex items-center bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.1] rounded overflow-hidden shadow-2xs">
                          <button
                            onClick={() => setTierValues((v) => ({ ...v, freeMax: Math.max(1, v.freeMax - 1) }))}
                            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-xs font-mono font-medium transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            readOnly
                            value={tierValues.freeMax}
                            className="w-full bg-transparent text-center font-mono text-xs text-slate-900 dark:text-zinc-100 font-semibold py-1 outline-none"
                          />
                          <button
                            onClick={() => setTierValues((v) => ({ ...v, freeMax: v.freeMax + 1 }))}
                            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-xs font-mono font-medium transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSaveTier('free', 'free', tierValues.freeMax)}
                      className="w-full bg-white hover:bg-slate-100 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] border border-slate-300 dark:border-white/[0.1] text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white font-mono text-[11px] font-semibold py-1.5 rounded transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-[14px]">save</span>
                      <span>Save HSET (PATCH)</span>
                    </button>
                  </div>

                  {/* Pro Tier */}
                  <div className="bg-slate-50/60 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.07] rounded-lg p-4 flex flex-col justify-between gap-4 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-sky-800 dark:text-cyan-300">Pro Tier</span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 font-medium">Sliding Window</span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 font-medium">Max Req / Window (Redis Hash)</span>
                        <div className="flex items-center bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.1] rounded overflow-hidden shadow-2xs">
                          <button
                            onClick={() => setTierValues((v) => ({ ...v, proMax: Math.max(1, v.proMax - 5) }))}
                            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-xs font-mono font-medium transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            readOnly
                            value={tierValues.proMax}
                            className="w-full bg-transparent text-center font-mono text-xs text-slate-900 dark:text-zinc-100 font-semibold py-1 outline-none"
                          />
                          <button
                            onClick={() => setTierValues((v) => ({ ...v, proMax: v.proMax + 5 }))}
                            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-xs font-mono font-medium transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSaveTier('pro', 'pro', tierValues.proMax)}
                      className="w-full bg-white hover:bg-slate-100 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] border border-slate-300 dark:border-white/[0.1] text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white font-mono text-[11px] font-semibold py-1.5 rounded transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-[14px]">save</span>
                      <span>Save HSET (PATCH)</span>
                    </button>
                  </div>

                  {/* Enterprise Tier */}
                  <div className="bg-slate-50/60 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.07] rounded-lg p-4 flex flex-col justify-between gap-4 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">Enterprise Tier</span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 font-medium">Token Bucket</span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 font-medium">Bucket Capacity (Redis Hash)</span>
                        <div className="flex items-center bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.1] rounded overflow-hidden shadow-2xs">
                          <button
                            onClick={() => setTierValues((v) => ({ ...v, entMax: Math.max(10, v.entMax - 10) }))}
                            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-xs font-mono font-medium transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            readOnly
                            value={tierValues.entMax}
                            className="w-full bg-transparent text-center font-mono text-xs text-slate-900 dark:text-zinc-100 font-semibold py-1 outline-none"
                          />
                          <button
                            onClick={() => setTierValues((v) => ({ ...v, entMax: v.entMax + 10 }))}
                            className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-white/[0.08] bg-slate-50 dark:bg-white/[0.04] text-xs font-mono font-medium transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSaveTier('enterprise', 'enterprise', tierValues.entMax)}
                      className="w-full bg-white hover:bg-slate-100 dark:bg-white/[0.05] dark:hover:bg-white/[0.1] border border-slate-300 dark:border-white/[0.1] text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white font-mono text-[11px] font-semibold py-1.5 rounded transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-[14px]">save</span>
                      <span>Save HSET (PATCH)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PAGE 4: STREAM INSPECTION */}
            {activeTab === 'streams' && (
              <div className="page-fade-in bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.07] rounded-xl p-5 flex flex-col gap-4 shadow-xs transition-colors duration-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-white/[0.05] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-sky-600 dark:text-cyan-400">receipt_long</span>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">Redis Stream Audit Logs</h2>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">XREAD / XREVRANGE <span className="text-sky-700 dark:text-cyan-400 font-medium">rl:stream:blocked</span></span>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={streamFilter}
                    onChange={(e) => setStreamFilter(e.target.value)}
                    placeholder="Filter by IP or Route..."
                    className="bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.1] text-slate-900 dark:text-zinc-200 font-mono text-xs px-3 py-1 rounded-md outline-none focus:border-sky-500 dark:focus:border-cyan-500"
                  />
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/[0.07]">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-slate-50/80 dark:bg-white/[0.03] text-[10px] text-slate-500 dark:text-zinc-400 uppercase border-b border-slate-200 dark:border-white/[0.06]">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Entry ID</th>
                        <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                        <th className="py-2.5 px-3 font-semibold">Target Route</th>
                        <th className="py-2.5 px-3 font-semibold text-sky-600 dark:text-cyan-400">Client IP</th>
                        <th className="py-2.5 px-3 font-semibold">Client Identity</th>
                        <th className="py-2.5 px-3 font-semibold">Engine Algorithm</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Verdict</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                      {filteredLogs.length > 0 ? (
                        filteredLogs.map((log, idx) => {
                          const isIpFormat = log.ip && (log.ip.includes('.') || log.ip.includes(':'));
                          const displayIp = isIpFormat ? log.ip : (log.clientIp || '::1');
                          const displayKey = log.clientKey || log.identifier || (!isIpFormat ? log.ip : 'anonymous');

                          return (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                              <td className="py-2.5 px-3 text-[11px] text-sky-700 dark:text-cyan-400 font-semibold">{log.id || `179203-${idx}`}</td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-500 dark:text-zinc-400">
                                {log.blockedAt ? new Date(log.blockedAt).toLocaleTimeString() : 'Recent'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-900 dark:text-zinc-200 font-medium">{log.endpoint || '/api/data'}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-zinc-100">
                                <div className="flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[13px] text-sky-500">lan</span>
                                  <span className="font-mono text-xs">{displayIp}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 dark:text-zinc-400 text-[11px] font-mono">
                                <span className="bg-slate-100 dark:bg-white/[0.04] px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/[0.06]">
                                  {displayKey}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 dark:text-zinc-400">{log.algorithm || 'fixed_window'}</td>
                              <td className="py-2.5 px-3 text-right">
                                <span className="text-[9px] font-bold text-rose-700 dark:text-crimson-400 bg-rose-50 dark:bg-crimson-500/10 border border-rose-200 dark:border-crimson-500/20 px-1.5 py-0.5 rounded">
                                  429 BLOCKED
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan="7" className="py-8 text-center text-xs text-slate-400 dark:text-zinc-500">
                            No matching stream audit logs found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* PAGE 5: SECURITY MITIGATION */}
            {activeTab === 'security' && (
              <div className="page-fade-in bg-white dark:bg-[#11141c] border border-slate-200 dark:border-white/[0.07] rounded-xl p-5 flex flex-col gap-5 shadow-xs transition-colors duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/[0.05] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400">lock_open</span>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">Emergency IP Flush & Unblock</h2>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400">Redis List Queue + Non-blocking scanStream Worker</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20">
                      Queue: {queueCount} pending
                    </span>
                    <span className="text-slate-500 dark:text-zinc-400 font-medium">Worker: Listening</span>
                  </div>
                </div>

                {/* RBAC Security Banner */}
                <div className={`p-3.5 rounded-lg border font-mono text-xs flex items-center justify-between gap-3 ${
                  activePersona.role === 'admin'
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-200'
                    : 'bg-amber-50/80 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[20px] shrink-0">
                      {activePersona.role === 'admin' ? 'admin_panel_settings' : 'gshield'}
                    </span>
                    <div>
                      <div className="font-semibold">
                        {activePersona.role === 'admin'
                          ? '👑 Admin Privileges Active — POST /api/admin/reset-ip Authorized'
                          : `🔒 Admin Required — Current Role: ${activePersona.role.toUpperCase()}`}
                      </div>
                      <div className="text-[11px] opacity-80">
                        {activePersona.role === 'admin'
                          ? 'Enqueuing unblock jobs via Redis LPUSH will be processed by the background worker.'
                          : 'Unblocking IPs is restricted to admin personas. Attempting to unblock will be rejected by RBAC with 403 FORBIDDEN.'}
                      </div>
                    </div>
                  </div>

                  {activePersona.role !== 'admin' && (
                    <button
                      onClick={() => {
                        setActivePersonaKey('adm_test_key');
                        showToast('Switched to DevOps Master Admin (role: admin)', 'success');
                      }}
                      className="shrink-0 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded text-[11px] shadow-xs active:scale-95 transition-all"
                    >
                      Switch to Master Admin
                    </button>
                  )}
                </div>

                {/* Input Row */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={targetIp}
                    onChange={(e) => setTargetIp(e.target.value)}
                    placeholder="IP Address or Key (e.g. ::1, free_test_key)"
                    className="flex-1 bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/[0.1] px-3.5 py-2 rounded-lg text-slate-900 dark:text-zinc-100 font-mono text-xs outline-none focus:border-sky-500 dark:focus:border-cyan-500 shadow-2xs"
                  />
                  <select
                    value={unblockReason}
                    onChange={(e) => setUnblockReason(e.target.value)}
                    className="bg-white dark:bg-[#151922] border border-slate-300 dark:border-white/[0.1] text-slate-700 dark:text-zinc-300 font-mono text-xs px-3 py-2 rounded-lg outline-none focus:border-sky-500 dark:focus:border-cyan-500 shadow-2xs font-medium"
                  >
                    <option>False Positive / Incident Resolve</option>
                    <option>VIP Customer Escalation</option>
                    <option>Load-Testing Benchmark Flush</option>
                  </select>
                  <button
                    onClick={handleEnqueueUnblock}
                    className="bg-sky-600 hover:bg-sky-700 text-white dark:bg-cyan-500 dark:hover:bg-cyan-400 dark:text-zinc-950 font-mono text-xs font-semibold px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 whitespace-nowrap active:scale-[0.98] shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[15px]">playlist_add</span>
                    <span>LPUSH unblock_queue</span>
                  </button>
                </div>

                {/* Streamlined Flow Diagram */}
                <div className="bg-slate-50 dark:bg-white/[0.02] p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] overflow-x-auto">
                  <div className="flex items-center justify-between min-w-[500px] font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                    <span className="text-slate-800 dark:text-zinc-200 font-medium">Console Admin</span>
                    <span className="text-sky-600 dark:text-cyan-400 font-semibold">── LPUSH ──▶</span>
                    <span className="text-slate-800 dark:text-zinc-200 font-medium">Redis unblock_queue</span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">── BRPOP ──▶</span>
                    <span className="text-slate-800 dark:text-zinc-200 font-medium">Worker Daemon</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">── DEL ──▶</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">Cluster Synced</span>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Interactive Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 pointer-events-none flex flex-col gap-1.5 max-w-sm w-full max-h-[85vh] overflow-y-auto pr-1">
        {toasts.map((t) => {
          let styleClasses = 'bg-white/95 border-slate-300 text-slate-800 dark:bg-[#151922]/95 dark:border-white/[0.1] dark:text-zinc-200 shadow-lg';
          let progressBarBg = 'bg-sky-500 dark:bg-cyan-400';
          let icon = 'info';
          let iconColor = 'text-sky-600 dark:text-cyan-400';

          if (t.type === 'error') {
            styleClasses = 'bg-rose-50/95 border-rose-300 text-rose-900 dark:bg-crimson-950/90 dark:border-crimson-500/40 dark:text-crimson-200 shadow-lg shadow-rose-500/10 dark:shadow-crimson-950/50';
            progressBarBg = 'bg-rose-500 dark:bg-crimson-500';
            icon = 'error';
            iconColor = 'text-rose-600 dark:text-crimson-400';
          } else if (t.type === 'success') {
            styleClasses = 'bg-emerald-50/95 border-emerald-300 text-emerald-900 dark:bg-emerald-950/90 dark:border-emerald-500/40 dark:text-emerald-200 shadow-lg shadow-emerald-500/10 dark:shadow-emerald-950/50';
            progressBarBg = 'bg-emerald-500 dark:bg-emerald-400';
            icon = 'check_circle';
            iconColor = 'text-emerald-600 dark:text-emerald-400';
          }

          return (
            <div
              key={t.id}
              className={`relative overflow-hidden pointer-events-auto flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg font-mono text-xs backdrop-blur-md border ${styleClasses} ${
                t.exiting ? 'toast-exit' : 'toast-enter'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 pr-1">
                <span className={`material-symbols-outlined text-[16px] shrink-0 ${iconColor}`}>{icon}</span>
                <span className="truncate font-medium">{t.message}</span>
              </div>

              <button
                onClick={() => dismissToast(t.id)}
                className="shrink-0 p-0.5 rounded text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors"
                title="Dismiss"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>

              {/* Countdown Progress Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/5 dark:bg-white/5 overflow-hidden">
                <div className={`h-full ${progressBarBg} toast-progress`}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
