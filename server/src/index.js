import path from 'node:path';
import { migrate } from './db.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3000);
const STATIC_DIR = process.env.STATIC_DIR || path.resolve('../client/dist');

await migrate();
createApp({ staticDir: STATIC_DIR }).listen(PORT, () => {
  console.log(`Ticket Tracker is running on http://localhost:${PORT}`);
});
