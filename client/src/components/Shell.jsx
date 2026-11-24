import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Link, navigate, useApp } from '../app-state.jsx';
import BoardPage from '../pages/BoardPage.jsx';
import TicketPage from '../pages/TicketPage.jsx';
import TeamsPage from '../pages/TeamsPage.jsx';
import EpicsPage from '../pages/EpicsPage.jsx';

export default function Shell({ loc }) {
  const { user, onLoggedOut, toast } = useApp();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);

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
        <nav>
          <Link to="/" className={`navlink ${section === 'board' ? 'active' : ''}`}>Board</Link>
          <Link to="/teams" className={`navlink ${section === 'teams' ? 'active' : ''}`}>Teams</Link>
          <Link to="/epics" className={`navlink ${section === 'epics' ? 'active' : ''}`}>Epics</Link>
        </nav>
        <div className="user-menu" ref={menuRef}>
          <button className="user-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}>
            {user.email} ▾
          </button>
          {menu && (
            <div className="menu" role="menu">
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
