import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Starting Vite development server...');
const vite = spawn('npx', ['vite'], { stdio: 'inherit', shell: true });

// Give Vite 2 seconds to initialize, compile electron files, then launch Electron
setTimeout(() => {
  console.log('Compiling Electron files...');
  const tsc = spawn('npx', ['tsc', '-p', 'tsconfig.electron.json'], { stdio: 'inherit', shell: true });
  
  tsc.on('exit', (code) => {
    if (code !== 0) {
      console.error('Failed to compile Electron files.');
      vite.kill();
      process.exit(1);
    }
    
    // Write local package.json to dist-electron to enforce CommonJS resolution
    const distElectronDir = './dist-electron';
    if (!fs.existsSync(distElectronDir)) {
      fs.mkdirSync(distElectronDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(distElectronDir, 'package.json'),
      JSON.stringify({ type: 'commonjs' }, null, 2)
    );
    console.log('Created dist-electron/package.json for CommonJS scope.');
    
    console.log('Launching Electron...');
    const electron = spawn('npx', ['electron', '.'], { stdio: 'inherit', shell: true });
    
    electron.on('close', () => {
      console.log('Electron window closed. Shutting down Vite server...');
      vite.kill();
      process.exit(0);
    });
  });
}, 2000);
