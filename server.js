import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { env } from './server/src/config/env.js';
import { repo } from './server/src/db/repository.js';
import { seedDatabase } from './server/src/seed/seedData.js';
import { initSocketServer } from './server/src/sockets/index.js';
import apiRouter from './server/src/routes/api.js';

async function bootstrap() {
  const engine = await repo.init();
  await seedDatabase(false);

  const app = express();
  app.set('trust proxy', 1);
  const httpServer = http.createServer(app);

  // Security & core middleware
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      origin: env.corsOrigin ? env.corsOrigin.split(',').map((o) => o.trim()) : true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan('dev'));

  // Attach Socket.IO to the same HTTP server on port 3000
  initSocketServer(httpServer);

  // Mount REST API
  app.use('/api', apiRouter);

  // Serve generated images directly from src/assets in both dev and prod
  const assetsDir = path.resolve(process.cwd(), 'src/assets');
  if (fs.existsSync(assetsDir)) {
    app.use('/src/assets', express.static(assetsDir));
  }

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = env.nodeEnv === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(
      `[Passline] Full-stack server running on http://localhost:${env.port} (DB: ${engine}, DEMO_MODE: ${env.demoMode})`
    );
  });
}

bootstrap().catch((err) => {
  console.error('[Passline] Fatal startup error:', err);
  process.exit(1);
});
