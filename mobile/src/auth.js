import { createContext, useContext, useEffect, useState } from 'react';
import { api, connectLive, disconnectLive, session, wakeServer } from './api';

const Ctx = createContext(null);
export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, user: null });
  const logout = async () => { disconnectLive(); await session.setToken(null); setState({ ready: true, user: null }); };
  useEffect(() => {
    session.onUnauthorized(logout);
    (async () => {
      const { token } = await session.load();
      wakeServer();
      if (!token) return setState({ ready: true, user: null });
      try { const { user } = await api('/auth/me'); connectLive(); setState({ ready: true, user }); }
      catch { setState({ ready: true, user: null }); }
    })();
  }, []);
  const login = async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    await session.setToken(r.token); connectLive();
    setState({ ready: true, user: r.user });
  };
  return <Ctx.Provider value={{ ...state, login, logout }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
