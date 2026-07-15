import { PrismaClient } from 'prisma-client';
import path from 'path';
import fs from 'fs';

let databaseUrl = 'file:./database/dsd-tracker.db';

// Check if we are in the Node/Electron Main process environment
if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
  try {
    // Dynamic require prevents Vite bundling errors in the renderer
    const { app } = require('electron');
    if (app) {
      const isDev = !app.isPackaged;
      const dbDir = isDev
        ? path.join(app.getAppPath(), 'database')
        : app.getPath('userData');

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
