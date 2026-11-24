import { Router } from 'express';
import { q } from '../db.js';
import { ah } from '../util.js';

const r = Router();

// People a ticket can be assigned to: verified users only. Only id and email are exposed.
r.get('/', ah(async (req, res) => {
  const rows = await q('SELECT id, email FROM users WHERE email_verified_at IS NOT NULL ORDER BY lower(email)');
  res.json({ users: rows.map((u) => ({ id: u.id, email: u.email })) });
}));

export default r;
