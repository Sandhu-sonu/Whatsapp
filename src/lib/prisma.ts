import { PrismaClient } from '@prisma/client';
import path from 'path';

let databaseUrl = 'file:./database/dsd-tracker.db';

// Check if we are in the Node/Electron Main process environment
if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
  try {
    // Dynamic require prevents Vite bundling errors in the renderer
    const { app } = require('electron');
    if (app) {
      const isDev = !app.isPackaged;
      if (!isDev) {
        const userDataPath = app.getPath('userData');
        const dbPath = path.join(userDataPath, 'dsd-tracker.db');
        databaseUrl = `file:${dbPath}`;
      }
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
