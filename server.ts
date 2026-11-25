import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initSchema, UPLOADS_DIR } from './server/db';
import { createApiRouter } from './server/routes';
import { seedInitialDatabase } from './server/seed';

dotenv.config();

async function startServer() {
  initSchema();
  seedInitialDatabase();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Serve uploaded images safely
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Serve default school crest reliably in both dev and prod
  app.get('/crest-default.jpg', (_req, res) => {
    const crestPath = path.resolve(process.cwd(), 'src/assets/images/ghana_school_crest_1794671276685.jpg');
    if (fs.existsSync(crestPath)) {
      res.sendFile(crestPath);
    } else {
      res.status(404).end();
    }
  });

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, mode: 'local-sqlite-api' });
  });

  // API Router
  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Akwaaba SchoolSuite running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
