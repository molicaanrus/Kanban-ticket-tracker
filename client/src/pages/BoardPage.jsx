import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, STATES, STATE_LABEL, TYPES, TYPE_LABEL, timeAgo } from '../api.js';
import { Link, navigate, useApp } from '../app-state.jsx';
import { EmptyState, TypeBadge } from '../components/ui.jsx';

// The selected team lives in the URL (?team=ID), so a refresh or a shared link keeps the same board.
const readTeamParam = () => new URLSearchParams(window.location.search).get('team') || '';

export default function BoardPage() {
  const { teams, notify } = useApp();
  const [teamId, setTeamId] = useState(readTeamParam);
  const [tickets, setTickets] = useState(null); // null = loading
  const [epics, setEpics] = useState([]);
  const [filters, setFilters] = useState({ q: '', type: '', epic: '' });
  const [dragId, setDragId] = useState(null);
  const [overState, setOverState] = useState(null);
  const [loadError, setLoadError] = useState('');

  // pick a valid team: the one in the URL, otherwise the first
  useEffect(() => {
    if (!teams || !teams.length) return;
    if (!teams.some((t) => String(t.id) === teamId)) {
      const first = String(teams[0].id);
      setTeamId(first);
      window.history.replaceState({}, '', `/?team=${first}`);
    }
  }, [teams, teamId]);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoadError('');
    try {
      const [t, e] = await Promise.all([api.get(`/tickets?teamId=${teamId}`), api.get(`/epics?teamId=${teamId}`)]);
      setTickets(t.tickets);
      setEpics(e.epics);
    } catch (err) {
      setLoadError(err.message);
      setTickets([]);
    }
  }, [teamId]);

  useEffect(() => {
    setTickets(null);
    setFilters({ q: '', type: '', epic: '' });
    load();
  }, [load]);

  const changeTeam = (id) => {
    setTeamId(id);
    window.history.replaceState({}, '', `/?team=${id}`);
  };

  // Filters are combined with AND and applied client-side
  const visible = useMemo(() => {
    if (!tickets) return [];
    const needle = filters.q.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        (!needle || t.title.toLowerCase().includes(needle)) &&
        (!filters.type || t.type === filters.type) &&
        (!filters.epic || (filters.epic === 'none' ? t.epicId === null : String(t.epicId) === filters.epic))
    );
  }, [tickets, filters]);

  const byState = useMemo(() => {
    const m = Object.fromEntries(STATES.map((s) => [s, []]));
    for (const t of visible) m[t.state].push(t);
    return m;
  }, [visible]);

  const filtersActive = filters.q || filters.type || filters.epic;

  // ---- drag and drop: optimistic move, persisted at once, rolled back on failure ----
  const move = async (id, state) => {
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket || ticket.state === state) return;
    const previous = tickets;
    setTickets(tickets.map((t) => (t.id === id ? { ...t, state } : t)));
    try {
      const { ticket: saved } = await api.patch(`/tickets/${id}`, { state });
      // keep "most recently modified first" using the server timestamp
      setTickets((cur) => [saved, ...cur.filter((t) => t.id !== id)]);
    } catch (e) {
      setTickets(previous); // card returns to its previous column
      notify(`Could not move "${ticket.title}": ${e.message}`, 'error');
    }
  };

  const drop = (state) => {
    const id = dragId;
    setDragId(null);
    setOverState(null);
    if (id !== null) move(id, state);
  };

  const noTeams = teams && teams.length === 0;

  return (
    <div className="page wide">
      <div className="board-head">
        <label className="field inline">
          <span>Team</span>
          <select value={teamId} onChange={(e) => changeTeam(e.target.value)} disabled={!teams?.length} aria-label="Team">
            {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button className="btn accent" disabled={!teamId} onClick={() => navigate(`/tickets/new?team=${teamId}`)}>+ New ticket</button>
      </div>

      {noTeams ? (
        <div className="card"><EmptyState>No teams yet. <Link to="/teams">Create a team</Link> to start tracking tickets.</EmptyState></div>
      ) : (
        <>
          <div className="filters card">
            <label className="field">
              <span>Search</span>
              <input placeholder="Search title…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            </label>
            <label className="field">
              <span>Type</span>
              <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
                <option value="">All types</option>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Epic</span>
              <select value={filters.epic} onChange={(e) => setFilters({ ...filters, epic: e.target.value })}>
                <option value="">All epics</option>
                <option value="none">No epic</option>
                {epics.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </label>
            <button className="btn" disabled={!filtersActive} onClick={() => setFilters({ q: '', type: '', epic: '' })}>Clear</button>
            <div className="ticket-count" aria-live="polite">
              {tickets === null ? '' : filtersActive ? `${visible.length} of ${tickets.length} tickets` : `${tickets.length} tickets`}
            </div>
          </div>

          {loadError && <div className="error-box" role="alert">{loadError} <button className="link-btn" onClick={load}>Retry</button></div>}

          {tickets === null ? (
            <div className="center-note">Loading board…</div>
          ) : (
            <>
              {tickets.length === 0 && !loadError && (
                <div className="hint-banner">This team has no tickets yet. Click “New ticket” to create the first one.</div>
              )}
              <div className="board" role="list">
                {STATES.map((state) => (
                  <section
                    key={state}
                    role="listitem"
                    aria-label={STATE_LABEL[state]}
                    data-state={state}
                    className={`column ${overState === state ? 'over' : ''} ${dragId !== null ? 'can-drop' : ''}`}
                    onDragOver={(e) => {
                      if (dragId === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (overState !== state) setOverState(state);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) setOverState((s) => (s === state ? null : s));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      drop(state);
                    }}
                  >
                    <div className="column-head">
                      <span>{STATE_LABEL[state]}</span>
                      <span className="count">{byState[state].length}</span>
                    </div>
                    <div className="column-body">
                      {byState[state].map((t) => (
                        <Card key={t.id} t={t} dragging={dragId === t.id} onMove={(st) => move(t.id, st)}
                          onDragStart={() => setDragId(t.id)}
                          onDragEnd={() => { setDragId(null); setOverState(null); }} />
                      ))}
                      {byState[state].length === 0 && <div className="column-empty">{filtersActive ? 'No matching tickets' : 'Drop a ticket here'}</div>}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Card({ t, dragging, onMove, onDragStart, onDragEnd }) {
  return (
    <article
      className={`card-ticket ${dragging ? 'dragging' : ''}`}
      draggable
      data-ticket-id={t.id}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(t.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <TypeBadge type={t.type} />
      <Link to={`/tickets/${t.id}?team=${t.teamId}`} className="card-title" draggable={false}>{t.title}</Link>
      <div className="card-foot">
        <span className="muted epic">{t.epicTitle ? `Epic: ${t.epicTitle}` : ''}</span>
        <span className="muted" title={t.modifiedAt}>{timeAgo(t.modifiedAt)}</span>
      </div>
      <select className="move-select" value={t.state} aria-label={`Move "${t.title}" to another column`}
        onChange={(e) => onMove(e.target.value)} draggable={false}>
        {STATES.map((st) => <option key={st} value={st}>{st === t.state ? `Status: ${STATE_LABEL[st]}` : `Move to: ${STATE_LABEL[st]}`}</option>)}
      </select>
    </article>
  );
}
