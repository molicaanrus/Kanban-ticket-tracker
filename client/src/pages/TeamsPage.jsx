import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../app-state.jsx';
import { Confirm, EmptyState, Modal } from '../components/ui.jsx';
import { timeAgo } from '../api.js';

function TeamForm({ team, onClose }) {
  const { loadTeams, notify } = useApp();
  const [name, setName] = useState(team?.name || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Team name must not be empty');
    setBusy(true);
    try {
      if (team) await api.patch(`/teams/${team.id}`, { name });
      else await api.post('/teams', { name });
      await loadTeams();
      notify(team ? 'Team renamed' : 'Team created');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal title={team ? 'Rename team' : 'Create team'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Team name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Platform Engineering" />
        </label>
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="row-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{team ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function TeamsPage() {
  const { teams, loadTeams, notify } = useApp();
  const [form, setForm] = useState(null); // null | {} | team
  const [toDelete, setToDelete] = useState(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Teams</h2>
          <p className="muted">All verified users can view and manage all teams.</p>
        </div>
        <button className="btn primary" onClick={() => setForm({})}>+ Create team</button>
      </div>

      <div className="card">
        {teams === null ? (
          <div className="center-note">Loading teams…</div>
        ) : teams.length === 0 ? (
          <EmptyState>No teams yet. Create the first team to start adding tickets.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th className="num">Tickets</th><th className="num">Epics</th><th>Modified</th><th className="actions">Actions</th></tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const blocked = t.ticketCount > 0 || t.epicCount > 0;
                return (
                  <tr key={t.id}>
                    <td><b>{t.name}</b></td>
                    <td className="num">{t.ticketCount}</td>
                    <td className="num">{t.epicCount}</td>
                    <td className="muted" title={t.modifiedAt}>{timeAgo(t.modifiedAt)}</td>
                    <td className="actions">
                      <button className="btn small" onClick={() => setForm(t)}>Edit</button>
                      <button
                        className="btn small"
                        disabled={blocked}
                        title={blocked ? 'Delete is disabled while the team contains tickets or epics' : 'Delete team'}
                        onClick={() => setToDelete(t)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="muted small-text">Delete is disabled while a team contains tickets or epics.</p>
      </div>

      {form && <TeamForm team={form.id ? form : null} onClose={() => setForm(null)} />}
      {toDelete && (
        <Confirm
          title="Delete team"
          text={`Delete team "${toDelete.name}"? This cannot be undone.`}
          onYes={async () => {
            try {
              await api.del(`/teams/${toDelete.id}`);
              await loadTeams();
              notify('Team deleted');
            } catch (e) {
              notify(e.message, 'error'); // e.g. 409: team is not empty
              await loadTeams();
              throw e;
            }
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
