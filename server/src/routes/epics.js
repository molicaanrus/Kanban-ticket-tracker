import { Router } from 'express';
import { one, q } from '../db.js';
import { ah, fail, parseId, requireText } from '../util.js';

const r = Router();

const SELECT = `SELECT e.*, t.name AS team_name,
       (SELECT count(*) FROM tickets k WHERE k.epic_id = e.id)::int AS ticket_count
  FROM epics e JOIN teams t ON t.id = e.team_id`;

const epicDto = (e) => ({
  id: e.id,
  teamId: e.team_id,
  teamName: e.team_name,
  title: e.title,
  description: e.description,
  createdAt: e.created_at,
  modifiedAt: e.modified_at,
  ticketCount: e.ticket_count,
});

async function getEpic(id) {
  const e = await one(`${SELECT} WHERE e.id = $1`, [id]);
  if (!e) fail(404, 'Epic not found', 'NOT_FOUND');
  return e;
}

const cleanDescription = (d) => {
  if (d === undefined || d === null) return null;
  if (typeof d !== 'string') fail(400, 'Description must be text', 'VALIDATION_ERROR');
  return d.trim() ? d : null;
};

// ?teamId= limits the list to one team
r.get('/', ah(async (req, res) => {
  const teamId = req.query.teamId ? parseId(req.query.teamId, 'team id') : null;
  const rows = teamId
    ? await q(`${SELECT} WHERE e.team_id = $1 ORDER BY lower(e.title)`, [teamId])
    : await q(`${SELECT} ORDER BY lower(t.name), lower(e.title)`);
  res.json({ epics: rows.map(epicDto) });
}));

r.get('/:id', ah(async (req, res) => {
  res.json({ epic: epicDto(await getEpic(parseId(req.params.id, 'epic id', 404))) });
}));

r.post('/', ah(async (req, res) => {
  const teamId = parseId(req.body.teamId, 'team');
  if (!(await one('SELECT 1 FROM teams WHERE id = $1', [teamId]))) fail(400, 'The selected team does not exist', 'VALIDATION_ERROR');
  const title = requireText(req.body.title, 'Epic title').trim();
  const { id } = await one(
    'INSERT INTO epics (team_id, title, description) VALUES ($1, $2, $3) RETURNING id',
    [teamId, title, cleanDescription(req.body.description)]
  );
  res.status(201).json({ epic: epicDto(await getEpic(id)) });
}));

r.patch('/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'epic id', 404);
  const epic = await getEpic(id);
  if (req.body.teamId !== undefined && Number(req.body.teamId) !== epic.team_id) {
    fail(400, 'The team of an epic cannot be changed', 'VALIDATION_ERROR');
  }
  const title = req.body.title !== undefined ? requireText(req.body.title, 'Epic title').trim() : epic.title;
  const description = req.body.description !== undefined ? cleanDescription(req.body.description) : epic.description;
  if (title !== epic.title || description !== epic.description) {
    await q('UPDATE epics SET title = $1, description = $2, modified_at = now() WHERE id = $3', [title, description, id]);
  }
  res.json({ epic: epicDto(await getEpic(id)) });
}));

r.delete('/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'epic id', 404);
  const epic = await getEpic(id);
  if (epic.ticket_count > 0) {
    fail(409, `Epic "${epic.title}" cannot be deleted because ${epic.ticket_count} ticket(s) reference it.`, 'EPIC_IN_USE');
  }
  await q('DELETE FROM epics WHERE id = $1', [id]);
  res.status(204).end();
}));

export default r;
