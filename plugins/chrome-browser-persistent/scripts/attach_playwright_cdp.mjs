import { chromium } from "playwright";

const endpoint = process.env.CDP_ENDPOINT || `http://127.0.0.1:${process.env.CHROME_DEBUG_PORT || 9222}`;

const browser = await chromium.connectOverCDP(endpoint);
const contexts = browser.contexts();
const pages = contexts.flatMap((ctx) => ctx.pages());

console.log(JSON.stringify({
  ok: true,
  endpoint,
  contextCount: contexts.length,
  pageCount: pages.length,
  pages: pages.map((p, idx) => ({ index: idx, url: p.url() }))
}, null, 2));

await browser.close();
