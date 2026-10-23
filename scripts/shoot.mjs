#!/usr/bin/env node
/**
 * Screenshot a page of the running dev app with headless Chromium (WebGL via SwiftShader).
 *   node scripts/shoot.mjs <url> <out.png> [waitMs] [width] [height]
 */
import { chromium } from '@playwright/test';

const [url, out, waitMs = '8000', width = '1440', height = '900'] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shoot.mjs <url> <out.png> [waitMs] [width] [height]');
  process.exit(2);
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(waitMs));
await page.screenshot({ path: out });
await browser.close();
console.log(errors.length ? `errors:\n${errors.slice(0, 10).join('\n')}` : 'ok, no page errors');
