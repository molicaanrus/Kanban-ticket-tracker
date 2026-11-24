import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { requireAuth } from './auth.js';
import authRoutes from './routes/auth.js';
import teamRoutes from './routes/teams.js';
import epicRoutes from './routes/epics.js';
import ticketRoutes from './routes/tickets.js';
import userRoutes from './routes/users.js';

export function createApp({ staticDir } = {}) {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Public: health check and the auth endpoints (sign-up, login, verification, resend)
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);

  // Everything else requires a verified, logged-in user
  app.use('/api/teams', requireAuth, teamRoutes);
  app.use('/api/epics', requireAuth, epicRoutes);
  app.use('/api/tickets', requireAuth, ticketRoutes);
  app.use('/api/users', requireAuth, userRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

  // Presentation tier: the compiled SPA (static files are public)
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body', code: 'VALIDATION_ERROR' });
    // database constraint backstops
    if (err.code === '23505') return res.status(409).json({ error: 'This value already exists', code: 'CONFLICT' });
    if (err.code === '23503') return res.status(409).json({ error: 'This record is referenced by other records', code: 'CONFLICT' });
    if (err.code === '23514' || err.code === '22P02') return res.status(400).json({ error: 'Invalid value', code: 'VALIDATION_ERROR' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message, code: err.code || 'ERROR' });
  });

  return app;
}
