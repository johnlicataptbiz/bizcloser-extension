import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = process.env.CHROME_DEBUG_PORT || "9222";
const endpoint = process.env.CDP_ENDPOINT || `http://127.0.0.1:${port}`;
const startUrl = process.env.CHROME_START_URL || "about:blank";
const maxWaitMs = Number(process.env.CDP_WAIT_MS || 15000);
const pollMs = 500;

const launcher = new URL("./start_chrome_persistent.sh", import.meta.url).pathname;

async function cdpReady() {
  try {
    const res = await fetch(`${endpoint}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

function runLauncher() {
  return new Promise((resolve, reject) => {
    const child = spawn(launcher, [startUrl], {
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Chrome launcher exited with code ${code}`));
    });
  });
}

async function waitForCDP() {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await cdpReady()) {
      return true;
    }
    await delay(pollMs);
  }
  return false;
}

if (!(await cdpReady())) {
  console.log(`CDP not reachable at ${endpoint}. Launching Chrome...`);
  await runLauncher();
}

if (!(await waitForCDP())) {
  throw new Error(
    `Timed out waiting for Chrome CDP at ${endpoint} after ${maxWaitMs}ms.`
  );
}

const browser = await chromium.connectOverCDP(endpoint);
const contexts = browser.contexts();
const pages = contexts.flatMap((ctx) => ctx.pages());

console.log(
  JSON.stringify(
    {
      ok: true,
      endpoint,
      contextCount: contexts.length,
      pageCount: pages.length,
      pages: pages.map((p, idx) => ({ index: idx, url: p.url() }))
    },
    null,
    2
  )
);

await browser.close();
