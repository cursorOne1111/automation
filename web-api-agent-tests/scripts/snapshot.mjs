import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import 'dotenv/config';

// 独立探索工具；调用前先 npm run demo，输出仅供 Agent 提取定位证据。
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(baseURL); await page.getByRole('heading').first().waitFor();
  const output = resolve('artifacts/exploration'); await mkdir(output, { recursive: true });
  await writeFile(`${output}/aria.yml`, await page.locator('body').ariaSnapshot());
  await page.screenshot({ path: `${output}/page.png`, fullPage: true });
  console.log(output);
} finally { await browser.close(); }
