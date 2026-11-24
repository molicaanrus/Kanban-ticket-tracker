import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, client, verifiedUser, q } from './helpers.js';

let ctx, alice, bob;
before(async () => {
  ctx = await startServer();
  alice = await verifiedUser(ctx.base, 'alice@example.com');
  bob = await verifiedUser(ctx.base, 'bob@example.com');
});
after(() => stopServer(ctx.server));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('every business endpoint requires authentication', async () => {
  const anon = client(ctx.base);
  for (const [m, u] of [['get', '/api/teams'], ['get', '/api/epics'], ['get', '/api/tickets?teamId=1'], ['get', '/api/tickets/1/comments']]) {
    assert.equal((await anon[m](u)).status, 401, u);
  }
  assert.equal((await anon.get('/api/health')).status, 200, 'health check stays public');
});

test('teams: unique case-insensitive names, rename, delete protection (409)', async () => {
  let r = await alice.post('/api/teams', { name: '   ' });
  assert.equal(r.status, 400);
  r = await alice.post('/api/teams', { name: '  Payments Team ' });
  assert.equal(r.status, 201);
  assert.equal(r.data.team.name, 'Payments Team', 'name is trimmed');
  const team = r.data.team;
  assert.equal((await bob.post('/api/teams', { name: 'payments team' })).status, 409);

  r = await bob.patch(`/api/teams/${team.id}`, { name: 'Payments' });
  assert.equal(r.status, 200, 'all verified users manage all teams');

  const epic = (await alice.post('/api/epics', { teamId: team.id, title: 'Checkout' })).data.epic;
  r = await alice.del(`/api/teams/${team.id}`);
  assert.equal(r.status, 409, 'team with an epic cannot be deleted');
  assert.equal(r.data.code, 'TEAM_NOT_EMPTY');
  await alice.del(`/api/epics/${epic.id}`);

  const t = (await alice.post('/api/tickets', { teamId: team.id, type: 'bug', title: 'x', body: 'y' })).data.ticket;
  assert.equal((await alice.del(`/api/teams/${team.id}`)).status, 409, 'team with a ticket cannot be deleted');
  await alice.del(`/api/tickets/${t.id}`);
  assert.equal((await alice.del(`/api/teams/${team.id}`)).status, 204, 'empty team can be deleted');
  assert.equal((await alice.get(`/api/teams/${team.id}`)).status, 404);
});

test('tickets: validation, epic/team consistency, modified_at rules, comments, cascade delete', async () => {
  const a = (await alice.post('/api/teams', { name: 'Team A' })).data.team;
  const b = (await alice.post('/api/teams', { name: 'Team B' })).data.team;
  const epicA = (await alice.post('/api/epics', { teamId: a.id, title: 'Epic A', description: 'd' })).data.epic;
  const epicB = (await alice.post('/api/epics', { teamId: b.id, title: 'Epic B' })).data.epic;

  const base = { teamId: a.id, type: 'feature', title: 'First ticket', body: 'Body text' };
  assert.equal((await alice.post('/api/tickets', { ...base, type: 'task' })).status, 400, 'invalid type');
  assert.equal((await alice.post('/api/tickets', { ...base, state: 'blocked' })).status, 400, 'invalid state');
  assert.equal((await alice.post('/api/tickets', { ...base, title: '  ' })).status, 400, 'empty title');
  assert.equal((await alice.post('/api/tickets', { ...base, body: '' })).status, 400, 'empty body');
  assert.equal((await alice.post('/api/tickets', { ...base, teamId: 9999 })).status, 400, 'unknown team');
  let r = await alice.post('/api/tickets', { ...base, epicId: epicB.id });
  assert.equal(r.status, 400, 'epic of another team is rejected');
  assert.equal(r.data.code, 'EPIC_TEAM_MISMATCH');

  r = await alice.post('/api/tickets', { ...base, epicId: epicA.id });
  assert.equal(r.status, 201);
  const t = r.data.ticket;
  assert.equal(t.state, 'new');
  assert.equal(t.createdBy.email, 'alice@example.com');
  assert.ok(t.createdAt.endsWith('Z'), 'timestamps are ISO-8601 UTC');

  // epic in use cannot be deleted
  r = await alice.del(`/api/epics/${epicA.id}`);
  assert.equal(r.status, 409);
  assert.equal(r.data.code, 'EPIC_IN_USE');
  // epic team cannot change
  assert.equal((await alice.patch(`/api/epics/${epicA.id}`, { teamId: b.id })).status, 400);

  // saving unchanged values does not advance modified_at
  await sleep(20);
  r = await alice.patch(`/api/tickets/${t.id}`, { title: 'First ticket', type: 'feature', state: 'new' });
  assert.equal(r.data.ticket.modifiedAt, t.modifiedAt);
  assert.equal(r.data.changed, false);

  // a real change does (drag-and-drop state change)
  await sleep(20);
  r = await alice.patch(`/api/tickets/${t.id}`, { state: 'in_progress' });
  assert.equal(r.status, 200);
  assert.equal(r.data.ticket.state, 'in_progress');
  assert.ok(r.data.ticket.modifiedAt > t.modifiedAt);
  const modifiedAfterMove = r.data.ticket.modifiedAt;
  assert.equal((await alice.patch(`/api/tickets/${t.id}`, { state: 'nope' })).status, 400);

  // changing the team while an epic of the old team is set is rejected; clearing the epic works
  r = await alice.patch(`/api/tickets/${t.id}`, { teamId: b.id });
  assert.equal(r.status, 400);
  r = await alice.patch(`/api/tickets/${t.id}`, { teamId: b.id, epicId: null });
  assert.equal(r.status, 200);
  assert.equal(r.data.ticket.teamId, b.id);
  assert.equal(r.data.ticket.epicId, null);

  // comments: oldest first, author recorded, ticket modified_at untouched
  const before = (await alice.get(`/api/tickets/${t.id}`)).data.ticket.modifiedAt;
  assert.ok(before >= modifiedAfterMove);
  assert.equal((await bob.post(`/api/tickets/${t.id}/comments`, { body: '   ' })).status, 400);
  await alice.post(`/api/tickets/${t.id}/comments`, { body: 'first' });
  await sleep(10);
  r = await bob.post(`/api/tickets/${t.id}/comments`, { body: 'second' });
  assert.equal(r.status, 201);
  assert.equal(r.data.comment.author.email, 'bob@example.com');
  r = await alice.get(`/api/tickets/${t.id}/comments`);
  assert.deepEqual(r.data.comments.map((c) => c.body), ['first', 'second']);
  assert.equal((await alice.get(`/api/tickets/${t.id}`)).data.ticket.modifiedAt, before, 'comments do not change modified_at');

  // board order: most recently modified first
  const t2 = (await alice.post('/api/tickets', { teamId: b.id, type: 'bug', title: 'Second', body: 'b' })).data.ticket;
  let list = (await alice.get(`/api/tickets?teamId=${b.id}`)).data.tickets;
  assert.deepEqual(list.map((x) => x.id), [t2.id, t.id]);
  await sleep(10);
  await alice.patch(`/api/tickets/${t.id}`, { state: 'done' });
  list = (await alice.get(`/api/tickets?teamId=${b.id}`)).data.tickets;
  assert.deepEqual(list.map((x) => x.id), [t.id, t2.id]);

  // filters are combined with AND; title search is case-insensitive
  assert.deepEqual((await alice.get(`/api/tickets?teamId=${b.id}&q=SECOND`)).data.tickets.map((x) => x.id), [t2.id]);
  assert.deepEqual((await alice.get(`/api/tickets?teamId=${b.id}&type=bug&q=first`)).data.tickets, []);
  assert.equal((await alice.get(`/api/tickets?teamId=${b.id}&type=bogus`)).status, 400);

  // deleting a ticket deletes its comments
  assert.equal((await alice.del(`/api/tickets/${t.id}`)).status, 204);
  assert.equal((await alice.get(`/api/tickets/${t.id}`)).status, 404);
  assert.equal((await alice.get(`/api/tickets/${t.id}/comments`)).status, 404);
  const { q } = await import('./helpers.js');
  assert.equal((await q('SELECT count(*)::int AS n FROM comments'))[0].n, 0);
});

test('assignee: optional, verified users only, changes count as modifications, filterable', async () => {
  const team = (await alice.post('/api/teams', { name: 'Assignee team' })).data.team;
  const base = { teamId: team.id, type: 'feature', title: 'Who does it', body: 'b' };

  // only verified users are offered
  const anon = client(ctx.base);
  await anon.post('/api/auth/signup', { email: 'unverified@example.com', password: 'password123' });
  const users = (await alice.get('/api/users')).data.users;
  assert.deepEqual(users.map((u) => u.email), ['alice@example.com', 'bob@example.com'], 'unverified users are not listed');
  assert.deepEqual(Object.keys(users[0]).sort(), ['email', 'id'], 'only id and email are exposed');
  assert.equal((await client(ctx.base).get('/api/users')).status, 401, 'the list needs a login');
  const bobId = users.find((u) => u.email === 'bob@example.com').id;
  const aliceId = users.find((u) => u.email === 'alice@example.com').id;

  // a ticket is unassigned by default and may be created with an assignee
  let r = await alice.post('/api/tickets', base);
  assert.equal(r.status, 201);
  assert.equal(r.data.ticket.assignee, null);
  const t = r.data.ticket;
  r = await alice.post('/api/tickets', { ...base, title: 'Assigned at creation', assigneeId: bobId });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.ticket.assignee, { id: bobId, email: 'bob@example.com' });
  const t2 = r.data.ticket;

  // the backend validates the reference
  assert.equal((await alice.post('/api/tickets', { ...base, assigneeId: 999999 })).status, 400, 'unknown user');
  assert.equal((await alice.post('/api/tickets', { ...base, assigneeId: 'abc' })).status, 400, 'not a number');
  const unverifiedId = (await q("SELECT id FROM users WHERE email = 'unverified@example.com'"))[0].id;
  assert.equal((await alice.patch(`/api/tickets/${t.id}`, { assigneeId: unverifiedId })).status, 400, 'unverified user');

  // assigning and unassigning are real changes: modified_at moves
  await sleep(20);
  r = await alice.patch(`/api/tickets/${t.id}`, { assigneeId: aliceId });
  assert.equal(r.status, 200);
  assert.equal(r.data.changed, true);
  assert.equal(r.data.ticket.assignee.email, 'alice@example.com');
  assert.ok(r.data.ticket.modifiedAt > t.modifiedAt);

  // saving the same assignee again is not a change; a patch without assigneeId keeps it
  const modified = r.data.ticket.modifiedAt;
  await sleep(20);
  r = await alice.patch(`/api/tickets/${t.id}`, { assigneeId: aliceId });
  assert.equal(r.data.changed, false);
  assert.equal(r.data.ticket.modifiedAt, modified);
  r = await alice.patch(`/api/tickets/${t.id}`, { state: 'ready_for_implementation' });
  assert.equal(r.data.ticket.assignee.email, 'alice@example.com', 'moving a ticket keeps its assignee');

  // filter: a user, unassigned, combined with other filters
  await alice.patch(`/api/tickets/${t.id}`, { assigneeId: null });
  const ids = async (qs) => (await alice.get(`/api/tickets?teamId=${team.id}${qs}`)).data.tickets.map((x) => x.id).sort();
  assert.deepEqual(await ids(`&assigneeId=${bobId}`), [t2.id]);
  assert.deepEqual(await ids('&assigneeId=none'), [t.id]);
  assert.deepEqual(await ids(`&assigneeId=${bobId}&type=bug`), [], 'filters combine with AND');
  assert.equal((await alice.get(`/api/tickets?teamId=${team.id}&assigneeId=abc`)).status, 400);

  // the ticket keeps working after the assignee is removed again; comments stay untouched
  assert.equal((await alice.get(`/api/tickets/${t.id}`)).data.ticket.assignee, null);
  for (const x of [t, t2]) await alice.del(`/api/tickets/${x.id}`);
  assert.equal((await alice.del(`/api/teams/${team.id}`)).status, 204);
});

test('a fresh database contains schema and migration metadata only', async () => {
  const { execFileSync } = await import('node:child_process');
  const { q } = await import('./helpers.js');
  await q('DROP DATABASE IF EXISTS tracker_fresh');
  await q('CREATE DATABASE tracker_fresh');
  const url = process.env.DATABASE_URL.replace(/\/[^/]+$/, '/tracker_fresh');
  const script = `
    const { migrate, q, pool } = await import('./src/db.js');
    await migrate();
    const out = {};
    for (const t of ['users', 'teams', 'epics', 'tickets', 'comments', 'sessions', 'email_verification_tokens'])
      out[t] = (await q('SELECT count(*)::int AS n FROM ' + t))[0].n;
    out.migrations = (await q('SELECT count(*)::int AS n FROM schema_migrations'))[0].n;
    console.log(JSON.stringify(out)); await pool.end();`;
  const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8',
  }).trim().split('\n').pop());
  assert.deepEqual(out, { users: 0, teams: 0, epics: 0, tickets: 0, comments: 0, sessions: 0, email_verification_tokens: 0, migrations: 2 });
  await q('DROP DATABASE tracker_fresh');
});
