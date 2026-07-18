import fs from 'fs';
import path from 'path';

const distElectronDir = './dist-electron';
if (!fs.existsSync(distElectronDir)) {
  fs.mkdirSync(distElectronDir, { recursive: true });
}
fs.writeFileSync(
  path.join(distElectronDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2)
);
console.log('Created dist-electron/package.json to force CommonJS scope.');

// Copy generated prisma-client folder to dist-electron
const srcClient = './src/generated/prisma-client';
const destClient = './dist-electron/src/generated/prisma-client';

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(source)) return;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  const files = fs.readdirSync(source);
  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);
    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      try {
        fs.copyFileSync(curSource, curTarget);
      } catch (err) {
        if (err.code === 'EBUSY' || err.code === 'EPERM') {
          console.warn(`[Warning] Could not overwrite locked file: ${curTarget} (skipping as it is already in use)`);
        } else {
          throw err;
        }
      }
    }
  }
}

copyFolderRecursiveSync(srcClient, destClient);
console.log('Copied src/generated/prisma-client to dist-electron/src/generated/prisma-client');

// Copy migrations folder to dist-electron
const srcMigrations = './src/database/migrations';
const destMigrations = './dist-electron/src/database/migrations';
copyFolderRecursiveSync(srcMigrations, destMigrations);
console.log('Copied src/database/migrations to dist-electron/src/database/migrations');
