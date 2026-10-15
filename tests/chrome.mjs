// Where Chrome / Edge is on this computer (set CHROME_PATH to override)
import fs from 'node:fs';
const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
export const CHROME = candidates.find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome not found: set CHROME_PATH to your chrome / msedge executable');
