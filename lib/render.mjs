// Gets the page as a visitor's browser sees it (after JavaScript runs).
// Sites built with Wix, Framer, React, etc. send an almost empty HTML shell,
// so checking the raw HTML would report false problems.
import { execFileSync } from 'node:child_process';
import * as chromeLauncher from 'chrome-launcher';
import { UA } from './ua.mjs';

export function renderDom(url) {
  try {
    const chrome = process.env.CHROME_PATH || chromeLauncher.Launcher.getFirstInstallation();
    const html = execFileSync(
      chrome,
      [
        '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        `--user-agent=${UA}`, '--virtual-time-budget=10000', '--dump-dom', url,
      ],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return html && html.length > 200 ? html : null;
  } catch {
    return null;
  }
}
