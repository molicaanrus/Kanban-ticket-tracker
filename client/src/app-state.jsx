import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// ---- minimal path router (History API) ----
export function navigate(path, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useLocation() {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const on = () => setLoc({ path: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return loc;
}

export function Link({ to, children, ...rest }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function AppProvider({ user, onLoggedOut, children }) {
  const [teams, setTeams] = useState(null); // null = loading
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const notify = useCallback((text, kind = 'success') => {
    setToast({ text, kind, id: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3500);
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const d = await api.get('/teams');
      setTeams(d.teams);
      return d.teams;
    } catch (e) {
      notify(e.message, 'error');
      setTeams((t) => t || []);
      return [];
    }
  }, [notify]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  return <Ctx.Provider value={{ user, onLoggedOut, teams, loadTeams, notify, toast }}>{children}</Ctx.Provider>;
}
