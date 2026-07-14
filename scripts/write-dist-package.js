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
