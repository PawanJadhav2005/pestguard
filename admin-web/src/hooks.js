import { useCallback, useEffect, useState } from 'react';
import { api, on } from './api';

// Load data from the API, and reload whenever one of the live events fires
export function useApi(path, events = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(0);
  const load = useCallback(async () => {
    try { setError(null); setData(await api(path)); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    if (!events.length) return;
    const h = () => { load(); setPulse(p => p + 1); };
    const offs = events.map(e => on(e, h));
    return () => offs.forEach(off => off());
  }, [load, events.join(',')]);
  return { data, error, loading, reload: load, pulse };
}

export const fmt = {
  money: n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
  num: n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }),
  date: d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-',
  dt: d => {
    if (!d) return '-';
    const x = new Date(d), t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(x).setHours(0, 0, 0, 0) - t) / 864e5);
    const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return `${day}, ${x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  },
  ago: d => { const m = Math.round((Date.now() - new Date(d)) / 6e4); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`; }
};
