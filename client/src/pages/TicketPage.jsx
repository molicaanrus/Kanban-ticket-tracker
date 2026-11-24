import { useCallback, useEffect, useState } from 'react';
import { api, STATES, STATE_LABEL, TYPES, TYPE_LABEL, formatUtc } from '../api.js';
import { Link, navigate, useApp } from '../app-state.jsx';
import { Confirm } from '../components/ui.jsx';

const EMPTY = { teamId: '', type: 'feature', state: 'new', epicId: '', assigneeId: '', title: '', body: '' };

export default function TicketPage({ idParam, search }) {
  const { teams, loadTeams, notify } = useApp();
  const isNew = idParam === 'new';
  const [ticket, setTicket] = useState(null); // saved ticket (null for new)
  const [form, setForm] = useState(EMPTY);
  const [epics, setEpics] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const backTeam = ticket?.teamId || form.teamId || new URLSearchParams(search).get('team') || '';
  const backTeamName = teams?.find((t) => String(t.id) === String(backTeam))?.name;

  const fromTicket = (t) => ({ teamId: String(t.teamId), type: t.type, state: t.state, epicId: t.epicId ? String(t.epicId) : '', assigneeId: t.assignee ? String(t.assignee.id) : '', title: t.title, body: t.body });

  // load the ticket, or prepare an empty form for a new one
  useEffect(() => {
    if (isNew) {
      const team = new URLSearchParams(search).get('team');
      setForm((f) => ({ ...f, teamId: team || '' }));
      return;
    }
    api.get(`/tickets/${idParam}`)
      .then((d) => {
        setTicket(d.ticket);
        setForm(fromTicket(d.ticket));
      })
      .catch((e) => {
        if (e.status === 404) setNotFound(true);
        else notify(e.message, 'error');
      })
      .finally(() => setLoading(false));
  }, [idParam, isNew, search, notify]);

  // default team for a new ticket when none was passed
  useEffect(() => {
    if (isNew && teams?.length && !teams.some((t) => String(t.id) === form.teamId)) {
      setForm((f) => ({ ...f, teamId: String(teams[0].id), epicId: '' }));
    }
  }, [isNew, teams, form.teamId]);

  // The epic drop-down always shows the epics of the selected team
  useEffect(() => {
    if (!form.teamId) return setEpics([]);
    let cancelled = false;
    api.get(`/epics?teamId=${form.teamId}`)
      .then((d) => !cancelled && setEpics(d.epics))
      .catch(() => !cancelled && setEpics([]));
    return () => { cancelled = true; };
  }, [form.teamId]);

  // people a ticket can be assigned to
  useEffect(() => {
    api.get('/users').then((d) => setUsers(d.users)).catch(() => setUsers([]));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Changing the team clears the epic, because epics belong to exactly one team
  const changeTeam = (e) => setForm((f) => ({ ...f, teamId: e.target.value, epicId: '' }));

  const validate = () => {
    const err = {};
    if (!form.teamId) err.teamId = 'Select a team';
    if (!form.title.trim()) err.title = 'Title must not be empty';
    if (!form.body.trim()) err.body = 'Body must not be empty';
    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const save = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;
    setSaving(true);
    const payload = { ...form, teamId: Number(form.teamId), epicId: form.epicId ? Number(form.epicId) : null, assigneeId: form.assigneeId ? Number(form.assigneeId) : null };
    try {
      if (isNew) {
        const d = await api.post('/tickets', payload);
        notify('Ticket created');
        await loadTeams();
        navigate(`/tickets/${d.ticket.id}?team=${d.ticket.teamId}`, { replace: true });
      } else {
        const d = await api.patch(`/tickets/${ticket.id}`, payload);
        setTicket(d.ticket);
        setForm(fromTicket(d.ticket));
        await loadTeams();
        notify(d.changed ? 'Ticket saved' : 'No changes to save');
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.del(`/tickets/${ticket.id}`);
      await loadTeams();
      notify('Ticket deleted');
      navigate(`/?team=${ticket.teamId}`);
    } catch (e) {
      notify(e.message, 'error');
      throw e;
    }
  };

  if (loading) return <div className="center-note">Loading ticket…</div>;
  if (notFound) {
    return (
      <div className="page">
        <div className="card"><h2>Ticket not found</h2><p>It may have been deleted.</p><Link to="/">← Back to the board</Link></div>
      </div>
    );
  }
  if (teams && teams.length === 0) {
    return <div className="page"><div className="card">Create a team first. <Link to="/teams">Go to teams</Link></div></div>;
  }

  return (
    <div className="page wide">
      <Link to={backTeam ? `/?team=${backTeam}` : '/'} className="back">← Back to {backTeamName || 'the board'}</Link>

      <div className="ticket-head">
        <div>
          {isNew ? (
            <h2>New ticket</h2>
          ) : (
            <>
              <div className="meta muted">
                {ticket.key} • Created by {ticket.createdBy.email} • Created {formatUtc(ticket.createdAt)} • Modified {formatUtc(ticket.modifiedAt)}
              </div>
              <h2 className="ticket-title">{ticket.title}</h2>
            </>
          )}
        </div>
        <div className="row">
          {!isNew && <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button type="submit" form="ticket-form" className="btn dark" disabled={saving}>{saving ? 'Saving…' : isNew ? 'Create' : 'Save'}</button>
        </div>
      </div>

      <div className={isNew ? '' : 'two-col ticket-cols'}>
        <form id="ticket-form" className="card stack" onSubmit={save} noValidate>
          <div className="grid3">
            <label className="field">
              <span>Team</span>
              <select value={form.teamId} onChange={changeTeam} aria-invalid={!!errors.teamId}>
                {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {errors.teamId && <small className="err">{errors.teamId}</small>}
            </label>
            <label className="field">
              <span>Type</span>
              <select value={form.type} onChange={set('type')}>
                {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>State</span>
              <select value={form.state} onChange={set('state')}>
                {STATES.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
              </select>
            </label>
          </div>
          <div className="grid2">
            <label className="field">
              <span>Epic</span>
              <select value={form.epicId} onChange={set('epicId')}>
                <option value="">No epic</option>
                {epics.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Assignee</span>
              <select value={form.assigneeId} onChange={set('assigneeId')}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Title</span>
            <input value={form.title} onChange={set('title')} aria-invalid={!!errors.title} placeholder="Short summary" />
            {errors.title && <small className="err">{errors.title}</small>}
          </label>
          <label className="field">
            <span>Body</span>
            <textarea rows={10} value={form.body} onChange={set('body')} aria-invalid={!!errors.body} placeholder="Describe the work. Plain text or Markdown." />
            {errors.body && <small className="err">{errors.body}</small>}
          </label>
          {formError && <div className="error-box" role="alert">{formError}</div>}
        </form>

        {!isNew && <Comments ticketId={ticket.id} />}
      </div>

      {confirmDelete && (
        <Confirm
          title="Delete ticket"
          text={`Delete ${ticket.key} “${ticket.title}” and all of its comments? This cannot be undone.`}
          onYes={remove}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function Comments({ ticketId }) {
  const { notify } = useApp();
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      setComments((await api.get(`/tickets/${ticketId}/comments`)).comments);
    } catch (e) {
      notify(e.message, 'error');
      setComments([]);
    }
  }, [ticketId, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async (e) => {
    e.preventDefault();
    if (!text.trim()) return notify('Comment must not be empty', 'error');
    setPosting(true);
    try {
      const d = await api.post(`/tickets/${ticketId}/comments`, { body: text });
      setComments((c) => [...(c || []), d.comment]);
      setText('');
      notify('Comment added');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <aside className="card comments">
      <div className="comments-head"><h3>Comments</h3><span className="count">{comments?.length ?? 0}</span></div>
      {comments === null ? (
        <div className="center-note">Loading comments…</div>
      ) : comments.length === 0 ? (
        <p className="muted">No comments yet.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment">
              <div className="comment-meta"><b>{c.author.email}</b><span className="muted">{formatUtc(c.createdAt)}</span></div>
              <div className="comment-body">{c.body}</div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={post} className="stack">
        <label className="field">
          <span>Add comment</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment…" />
        </label>
        <div className="row-end"><button className="btn dark" disabled={posting}>{posting ? 'Posting…' : 'Post comment'}</button></div>
      </form>
    </aside>
  );
}
