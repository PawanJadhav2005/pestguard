import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api, onLive } from './api';

// Fetch on screen focus, and again whenever one of the live events fires
export function useApi(path, events = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!path) return;
    try { setError(null); setData(await api(path)); } catch (e) { setError(e.message); } finally { setLoading(false); setRefreshing(false); }
  }, [path]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { const offs = events.map(e => onLive(e, load)); return () => offs.forEach(o => o()); }, [load, events.join(',')]);
  return { data, error, loading, refreshing, reload: load, refresh: () => { setRefreshing(true); load(); } };
}
