import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Link, navigate, useApp } from '../app-state.jsx';
import { useTheme } from '../theme.jsx';
import BoardPage from '../pages/BoardPage.jsx';
import TicketPage from '../pages/TicketPage.jsx';
import TeamsPage from '../pages/TeamsPage.jsx';
import EpicsPage from '../pages/EpicsPage.jsx';

const NAV = [['board', '/', 'Board'], ['teams', '/teams', 'Teams'], ['epics', '/epics', 'Epics']];

// Segmented menu: the dark "thumb" slides under the active link.
function NavSlider({ section }) {
  const navRef = useRef(null);
  const [thumb, setThumb] = useState(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const place = () => {
      const el = navRef.current?.querySelector('.navlink.active');
      if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    place();
    window.addEventListener('resize', place);
    document.fonts?.ready.then(place);
    return () => window.removeEventListener('resize', place);
  }, [section]);

  // animate only after the first placement, so the thumb does not fly in on page load
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <nav ref={navRef} className={ready ? 'nav-ready' : ''}>
      {thumb && <span className="nav-thumb" style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }} aria-hidden="true" />}
      {NAV.map(([key, to, label]) => (
        <Link key={key} to={to} className={`navlink ${section === key ? 'active' : ''}`}>{label}</Link>
      ))}
    </nav>
  );
}

export default function Shell({ loc }) {
  const { user, onLoggedOut, toast } = useApp();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const close = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      onLoggedOut();
    }
  };

  const path = loc.path;
  const ticketMatch = path.match(/^\/tickets\/(new|\d+)$/);
  const section = path.startsWith('/teams') ? 'teams' : path.startsWith('/epics') ? 'epics' : 'board';

  useEffect(() => {
    if (!['/', '/teams', '/epics'].includes(path) && !ticketMatch) navigate('/', { replace: true });
  }, [path, ticketMatch]);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">TICKET TRACKER</Link>
        <NavSlider section={section} />
        <div className="user-menu" ref={menuRef}>
          <button className="user-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
            {user.email} ▾
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={toggle}>{theme === 'dark' ? '☀ Light theme' : '☾ Dark theme'}</button>
              <button role="menuitem" onClick={logout}>Log out</button>
            </div>
          )}
        </div>
      </header>
      <main className="content">
        {ticketMatch ? (
          <TicketPage key={ticketMatch[1]} idParam={ticketMatch[1]} search={loc.search} />
        ) : section === 'teams' ? (
          <TeamsPage />
        ) : section === 'epics' ? (
          <EpicsPage />
        ) : (
          <BoardPage />
        )}
      </main>
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
