import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import express from 'express';
import './db.js';
import { hostelsRouter } from './routes/hostels.js';
import { authRouter } from './routes/auth.js';
import { counsellingRouter } from './routes/counselling.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'vit-hostel-guide-api' }));
app.use('/api', hostelsRouter);
app.use('/api', authRouter);
app.use('/api', counsellingRouter);

const distPath = path.join(__dirname, 'dist');
if (existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}
