import { Router } from 'express';
import { one, q } from '../db.js';
import { ah, fail, parseId, requireText, requireEnum, TYPES, STATES } from '../util.js';

const r = Router();

const SELECT = `SELECT k.*, t.name AS team_name, e.title AS epic_title, u.email AS created_by_email,
       (SELECT count(*) FROM comments c WHERE c.ticket_id = k.id)::int AS comment_count
  FROM tickets k
  JOIN teams t ON t.id = k.team_id
  LEFT JOIN epics e ON e.id = k.epic_id
  JOIN users u ON u.id = k.created_by`;

export const ticketDto = (k) => ({
  id: k.id,
  key: `TCK-${k.id}`,
  teamId: k.team_id,
  teamName: k.team_name,
  type: k.type,
  state: k.state,
  epicId: k.epic_id,
  epicTitle: k.epic_title,
  title: k.title,
  body: k.body,
  createdAt: k.created_at,
  modifiedAt: k.modified_at,
  createdBy: { id: k.created_by, email: k.created_by_email },
  commentCount: k.comment_count,
});

async function getTicket(id) {
  const k = await one(`${SELECT} WHERE k.id = $1`, [id]);
  if (!k) fail(404, 'Ticket not found', 'NOT_FOUND');
  return k;
}

async function assertTeam(teamId) {
  if (!(await one('SELECT 1 FROM teams WHERE id = $1', [teamId]))) fail(400, 'The selected team does not exist', 'VALIDATION_ERROR');
}

// A ticket may reference only an epic of its own team
async function assertEpicInTeam(epicId, teamId) {
  if (epicId === null) return;
  const epic = await one('SELECT team_id FROM epics WHERE id = $1', [epicId]);
  if (!epic) fail(400, 'The selected epic does not exist', 'VALIDATION_ERROR');
  if (epic.team_id !== teamId) fail(400, 'The selected epic belongs to a different team', 'EPIC_TEAM_MISMATCH');
}

const parseEpic = (v) => (v === null || v === '' || v === undefined ? null : parseId(v, 'epic'));

// Board data: all tickets of one team, most recently modified first.
// Optional server-side filters: type, epicId (or "none"), q (case-insensitive title substring).
r.get('/', ah(async (req, res) => {
  const teamId = parseId(req.query.teamId, 'team id');
  const where = ['k.team_id = $1'];
  const params = [teamId];
  if (req.query.type) {
    params.push(requireEnum(req.query.type, TYPES, 'type'));
    where.push(`k.type = $${params.length}`);
  }
  if (req.query.epicId === 'none') where.push('k.epic_id IS NULL');
  else if (req.query.epicId) {
    params.push(parseId(req.query.epicId, 'epic id'));
    where.push(`k.epic_id = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${String(req.query.q).replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`k.title ILIKE $${params.length}`);
  }
  const rows = await q(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY k.modified_at DESC, k.id DESC`, params);
  res.json({ tickets: rows.map(ticketDto) });
}));

r.get('/:id', ah(async (req, res) => {
  res.json({ ticket: ticketDto(await getTicket(parseId(req.params.id, 'ticket id', 404))) });
}));

r.post('/', ah(async (req, res) => {
  const teamId = parseId(req.body.teamId, 'team');
  await assertTeam(teamId);
  const type = requireEnum(req.body.type, TYPES, 'Type');
  const state = req.body.state === undefined ? 'new' : requireEnum(req.body.state, STATES, 'State');
  const epicId = parseEpic(req.body.epicId);
  await assertEpicInTeam(epicId, teamId);
  const title = requireText(req.body.title, 'Title').trim();
  const body = requireText(req.body.body, 'Body');
  const { id } = await one(
    `INSERT INTO tickets (team_id, type, state, epic_id, title, body, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [teamId, type, state, epicId, title, body, req.user.id]
  );
  res.status(201).json({ ticket: ticketDto(await getTicket(id)) });
}));

// Partial update. modified_at moves only if a value really changes.
r.patch('/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'ticket id', 404);
  const cur = await getTicket(id);
  const b = req.body;
  const next = {
    team_id: b.teamId !== undefined ? parseId(b.teamId, 'team') : cur.team_id,
    type: b.type !== undefined ? requireEnum(b.type, TYPES, 'Type') : cur.type,
    state: b.state !== undefined ? requireEnum(b.state, STATES, 'State') : cur.state,
    epic_id: b.epicId !== undefined ? parseEpic(b.epicId) : cur.epic_id,
    title: b.title !== undefined ? requireText(b.title, 'Title').trim() : cur.title,
    body: b.body !== undefined ? requireText(b.body, 'Body') : cur.body,
  };
  if (next.team_id !== cur.team_id) await assertTeam(next.team_id);
  await assertEpicInTeam(next.epic_id, next.team_id);

  const changed = Object.keys(next).some((k) => next[k] !== cur[k]);
  if (changed) {
    await q(
      `UPDATE tickets SET team_id = $1, type = $2, state = $3, epic_id = $4, title = $5, body = $6, modified_at = now()
        WHERE id = $7`,
      [next.team_id, next.type, next.state, next.epic_id, next.title, next.body, id]
    );
  }
  res.json({ ticket: ticketDto(await getTicket(id)), changed });
}));

r.delete('/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'ticket id', 404);
  await getTicket(id);
  await q('DELETE FROM tickets WHERE id = $1', [id]); // comments are removed by ON DELETE CASCADE
  res.status(204).end();
}));

// ---- comments (immutable; adding one does not touch the ticket's modified_at) ----
const commentDto = (c) => ({
  id: c.id,
  ticketId: c.ticket_id,
  author: { id: c.author_id, email: c.author_email },
  body: c.body,
  createdAt: c.created_at,
});

r.get('/:id/comments', ah(async (req, res) => {
  const id = parseId(req.params.id, 'ticket id', 404);
  await getTicket(id);
  const rows = await q(
    `SELECT c.*, u.email AS author_email FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.ticket_id = $1 ORDER BY c.created_at, c.id`,
    [id]
  );
  res.json({ comments: rows.map(commentDto) });
}));

r.post('/:id/comments', ah(async (req, res) => {
  const id = parseId(req.params.id, 'ticket id', 404);
  await getTicket(id);
  const body = requireText(req.body.body, 'Comment');
  const c = await one(
    'INSERT INTO comments (ticket_id, author_id, body) VALUES ($1, $2, $3) RETURNING *',
    [id, req.user.id, body]
  );
  res.status(201).json({ comment: commentDto({ ...c, author_email: req.user.email }) });
}));

export default r;
