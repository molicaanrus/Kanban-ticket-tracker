import { useCallback, useEffect, useState } from 'react';
import { api, timeAgo } from '../api.js';
import { navigate, useApp } from '../app-state.jsx';
import { Confirm, EmptyState } from '../components/ui.jsx';

export default function EpicsPage() {
  const { teams, loadTeams, notify } = useApp();
  const [teamId, setTeamId] = useState('');
  const [epics, setEpics] = useState(null);
  const [form, setForm] = useState(null); // null | { epic?: epic }
  const [toDelete, setToDelete] = useState(null);

  // default to the first team once teams are known
  useEffect(() => {
    if (teams && teams.length && !teams.some((t) => String(t.id) === String(teamId))) setTeamId(String(teams[0].id));
  }, [teams, teamId]);

  const load = useCallback(async () => {
    if (!teamId) return setEpics([]);
    try {
      setEpics((await api.get(`/epics?teamId=${teamId}`)).epics);
    } catch (e) {
      notify(e.message, 'error');
      setEpics([]);
    }
  }, [teamId, notify]);

  useEffect(() => {
    setEpics(null);
    setForm(null);
    load();
  }, [load]);

  const team = teams?.find((t) => String(t.id) === String(teamId));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Epics</h2>
          <label className="field inline">
            <span>Team</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!teams?.length}>
              {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        <button className="btn primary" disabled={!team} onClick={() => setForm({})}>+ Create epic</button>
      </div>

      {teams && teams.length === 0 ? (
        <div className="card"><EmptyState icon="◎" title="Create a team first" action={<button className="btn accent" onClick={() => navigate('/teams')}>Go to Teams</button>}>
          Every epic belongs to exactly one team.
        </EmptyState></div>
      ) : (
        <div className="two-col">
          <div className="card">
            {epics === null ? (
              <div className="center-note">Loading epics…</div>
            ) : epics.length === 0 ? (
              <EmptyState icon="◇" title="No epics yet" action={<button className="btn accent" onClick={() => setForm({})}>+ Create epic</button>}>
                Epics group related tickets. Create the first one for this team.
              </EmptyState>
            ) : (
              <table className="table">
                <thead><tr><th>Title</th><th className="num">Tickets</th><th className="hide-mobile">Modified</th><th className="actions">Actions</th></tr></thead>
                <tbody>
                  {epics.map((e) => (
                    <tr key={e.id} className={form?.epic?.id === e.id ? 'selected' : ''}>
                      <td><b>{e.title}</b>{e.description && <div className="muted small-text clamp">{e.description}</div>}</td>
                      <td className="num">{e.ticketCount}</td>
                      <td className="muted hide-mobile" title={e.modifiedAt}>{timeAgo(e.modifiedAt)}</td>
                      <td className="actions">
                        <button className="btn small" onClick={() => setForm({ epic: e })}>Edit</button>
                        <button
                          className={`btn small${e.ticketCount > 0 ? ' looks-disabled' : ''}`}
                          aria-label={`Delete epic ${e.title}`}
                          title={e.ticketCount > 0 ? 'Cannot be deleted: tickets still use this epic' : 'Delete epic'}
                          onClick={() => (e.ticketCount > 0
                            ? notify(`Cannot delete "${e.title}": tickets still use this epic.`, 'error')
                            : setToDelete(e))}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted small-text">An epic that is still used by tickets cannot be deleted.</p>
          </div>

          {form && (
            <EpicForm
              key={form.epic?.id || 'new'}
              epic={form.epic}
              team={team}
              onCancel={() => setForm(null)}
              onSaved={async () => {
                setForm(null);
                await Promise.all([load(), loadTeams()]);
              }}
            />
          )}
        </div>
      )}

      {toDelete && (
        <Confirm
          title="Delete epic"
          text={`Delete epic "${toDelete.title}"? This cannot be undone.`}
          onYes={async () => {
            try {
              await api.del(`/epics/${toDelete.id}`);
              notify('Epic deleted');
              await Promise.all([load(), loadTeams()]);
            } catch (e) {
              notify(e.message, 'error'); // e.g. 409: tickets still reference it
              await load();
              throw e;
            }
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}

function EpicForm({ epic, team, onCancel, onSaved }) {
  const { notify } = useApp();
  const [v, setV] = useState({ title: epic?.title || '', description: epic?.description || '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!v.title.trim()) return setError('Epic title must not be empty');
    setBusy(true);
    try {
      if (epic) await api.patch(`/epics/${epic.id}`, v);
      else await api.post('/epics', { ...v, teamId: team.id });
      notify(epic ? 'Epic saved' : 'Epic created');
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <h3>{epic ? 'Edit epic' : 'Create epic'}</h3>
      <div className="muted">Team: <b>{epic ? epic.teamName : team.name}</b>{epic && ' (cannot be changed)'}</div>
      <label className="field">
        <span>Title</span>
        <input autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      </label>
      <label className="field">
        <span>Description (optional)</span>
        <textarea rows={5} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </label>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="row-end">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={busy}>Save</button>
      </div>
    </form>
  );
}
