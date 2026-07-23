import { PrismaClient } from '../generated/prisma-client';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

const absoluteDbPath = __dirname.includes('dist-electron')
  ? path.resolve(__dirname, '../../../prisma/database/dsd-tracker.db')
  : path.resolve(__dirname, '../../prisma/database/dsd-tracker.db');
let databaseUrl = `file:${absoluteDbPath}`;

// Check if we are in the Node/Electron Main process environment
if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
  try {
    // Dynamic require prevents Vite bundling errors in the renderer
    const { app } = require('electron');
    if (app) {
      const isDev = !app.isPackaged;
      const dbDir = isDev
        ? path.join(app.getAppPath(), 'database')
        : path.join(app.getPath('userData'), 'database');

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const activeDbPath = path.join(dbDir, 'dsd-tracker.db');
      if (!fs.existsSync(activeDbPath)) {
        const templateDbPath = path.join(app.getAppPath(), 'prisma', 'database', 'dsd-tracker.db');
        if (fs.existsSync(templateDbPath)) {
          fs.copyFileSync(templateDbPath, activeDbPath);
        }
      }

      databaseUrl = `file:${activeDbPath}`;
    }
  } catch (e) {
    // Fallback if imported in non-main environment
  }
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

// Configure SQLite WAL mode and performance pragmas on connection load
(async () => {
  try {
    await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;');
    await prisma.$executeRawUnsafe('PRAGMA synchronous=NORMAL;');
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;');
    await prisma.$executeRawUnsafe('PRAGMA busy_timeout=5000;');
    await prisma.$executeRawUnsafe('PRAGMA temp_store=MEMORY;');
    logger.info('Prisma Client: SQLite database configured with WAL and performance pragmas successfully.');
  } catch (error) {
    logger.error(error, 'Prisma Client: Failed to apply SQLite performance pragmas');
  }
})();
