import { Router } from 'express';
import { one, q } from '../db.js';
import { ah, fail, parseId, requireText } from '../util.js';

const r = Router();

const SELECT = `SELECT t.id, t.name, t.created_at, t.modified_at,
       (SELECT count(*) FROM tickets k WHERE k.team_id = t.id)::int AS ticket_count,
       (SELECT count(*) FROM epics e WHERE e.team_id = t.id)::int AS epic_count
  FROM teams t`;

export const teamDto = (t) => ({
  id: t.id,
  name: t.name,
  createdAt: t.created_at,
  modifiedAt: t.modified_at,
  ticketCount: t.ticket_count,
  epicCount: t.epic_count,
});

async function getTeam(id) {
  const t = await one(`${SELECT} WHERE t.id = $1`, [id]);
  if (!t) fail(404, 'Team not found', 'NOT_FOUND');
  return t;
}

async function assertNameFree(name, exceptId = 0) {
  if (await one('SELECT 1 FROM teams WHERE lower(name) = lower($1) AND id <> $2', [name, exceptId])) {
    fail(409, `A team named "${name}" already exists`, 'TEAM_NAME_TAKEN');
  }
}

r.get('/', ah(async (req, res) => {
  const rows = await q(`${SELECT} ORDER BY lower(t.name)`);
  res.json({ teams: rows.map(teamDto) });
}));

r.get('/:id', ah(async (req, res) => {
  res.json({ team: teamDto(await getTeam(parseId(req.params.id, 'team id', 404))) });
}));

r.post('/', ah(async (req, res) => {
  const name = requireText(req.body.name, 'Team name').trim();
  await assertNameFree(name);
  const { id } = await one('INSERT INTO teams (name) VALUES ($1) RETURNING id', [name]);
  res.status(201).json({ team: teamDto(await getTeam(id)) });
}));

r.patch('/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'team id', 404);
  const team = await getTeam(id);
  const name = requireText(req.body.name, 'Team name').trim();
  if (name !== team.name) {
    await assertNameFree(name, id);
    await q('UPDATE teams SET name = $1, modified_at = now() WHERE id = $2', [name, id]);
  }
  res.json({ team: teamDto(await getTeam(id)) });
}));

r.delete('/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'team id', 404);
  const team = await getTeam(id);
  if (team.ticket_count > 0 || team.epic_count > 0) {
    fail(409, `Team "${team.name}" cannot be deleted because it still has ${team.ticket_count} ticket(s) and ${team.epic_count} epic(s). Move or delete them first.`, 'TEAM_NOT_EMPTY');
  }
  await q('DELETE FROM teams WHERE id = $1', [id]);
  res.status(204).end();
}));

export default r;
