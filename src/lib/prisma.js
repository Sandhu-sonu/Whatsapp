"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const path_1 = __importDefault(require("path"));
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
                const dbPath = path_1.default.join(userDataPath, 'dsd-tracker.db');
                databaseUrl = `file:${dbPath}`;
            }
        }
    }
    catch (e) {
        // Fallback if imported in non-main environment
    }
}
exports.prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: databaseUrl,
        },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
