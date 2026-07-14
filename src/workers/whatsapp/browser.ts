import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export class PlaywrightService {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private logCallback: (level: 'info' | 'warn' | 'error' | 'debug', msg: string, meta?: any) => void;

  constructor(logCallback: (level: 'info' | 'warn' | 'error' | 'debug', msg: string, meta?: any) => void) {
    this.logCallback = logCallback;
  }

  public async launch(profilePath: string, headless: boolean): Promise<Page> {
    this.logCallback('info', `[Worker] Initializing Playwright`);
    this.logCallback('info', `[Worker] Launching Chromium at path: ${profilePath}, headless: ${headless}`);
    
    // Ensure parent folder of profile exists
    const parentDir = path.dirname(profilePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    try {
      this.context = await chromium.launchPersistentContext(profilePath, {
        headless,
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      this.page = this.context.pages()[0] || (await this.context.newPage());
      this.logCallback('info', '[Worker] Browser launched successfully');
      
      return this.page;
    } catch (error: any) {
      this.logCallback('error', 'Failed to launch Playwright browser context', { error: error.message });
      throw error;
    }
  }

  public getPage(): Page | null {
    return this.page;
  }

  public async close() {
    this.logCallback('info', 'Closing Playwright context');
    try {
      if (this.context) {
        await this.context.close();
      }
    } catch (error: any) {
      this.logCallback('warn', 'Failed to close Playwright context clean', { error: error.message });
    } finally {
      this.context = null;
      this.page = null;
    }
  }

  public async takeScreenshot(category: string): Promise<string | null> {
    if (!this.page) return null;
    try {
      const baseDir = path.join(process.cwd(), 'screenshots');
      const categoryDir = path.join(baseDir, category);
      if (!fs.existsSync(categoryDir)) {
        fs.mkdirSync(categoryDir, { recursive: true });
      }

      const filename = `${Date.now()}.png`;
      const filepath = path.join(categoryDir, filename);
      await this.page.screenshot({ path: filepath });
      
      this.logCallback('debug', `Captured screenshot category "${category}": ${filename}`);
      this.pruneScreenshots();
      
      return filepath;
    } catch (e: any) {
      this.logCallback('warn', `Failed to capture screenshot: ${e.message}`);
      return null;
    }
  }

  private pruneScreenshots() {
    const baseDir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(baseDir)) return;

    try {
      const files: { path: string; mtime: number }[] = [];
      const scanDir = (dir: string) => {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (item.endsWith('.png')) {
            files.push({ path: fullPath, mtime: stat.mtimeMs });
          }
        }
      };
      
      scanDir(baseDir);

      if (files.length > 50) {
        // Sort oldest first
        files.sort((a, b) => a.mtime - b.mtime);
        const toDelete = files.slice(0, files.length - 50);
        for (const f of toDelete) {
          fs.unlinkSync(f.path);
        }
        this.logCallback('debug', `Pruned ${toDelete.length} old screenshots`);
      }
    } catch (e: any) {
      this.logCallback('warn', `Failed to prune screenshots folder: ${e.message}`);
    }
  }
}
