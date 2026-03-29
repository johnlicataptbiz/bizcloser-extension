const { chromium } = require('playwright');

async function run() {
  const repoRoot = '/Users/jl/Desktop/apps/bizcloser-extension';
  const context = await chromium.launchPersistentContext(
    `${repoRoot}/output/playwright/debug-${Date.now()}`,
    {
      headless: true,
      viewport: { width: 440, height: 920 },
      args: [
        `--disable-extensions-except=${repoRoot}`,
        `--load-extension=${repoRoot}`,
      ],
    }
  );

  await context.route('**/api/bizcloser/**', async (route) => {
    const routeName = new URL(route.request().url()).pathname.split('/').pop();
    if (routeName === 'analyze') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: 's',
          intent: 'i',
          recommendedAngle: 'strategy call',
          objections: ['o'],
          confidence: 'High',
        }),
      });
    }
    if (routeName === 'generate') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Draft with strategy call weekdays AM or PM' }),
      });
    }
    if (routeName === 'refine') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'Refined strategy call weekdays AM or PM',
          changes: ['x'],
          verdict: 'ok',
        }),
      });
    }
    if (routeName === 'history' || routeName === 'feedback') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([a-z]{32})\//)[1];

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
  await page.fill('#threadInput', 'Lead: hi\nSetter: hey\nLead: need strategy\nSetter: sure');
  await page.click('#primaryActionBtn');
  await page.waitForTimeout(7000);

  const snapshot = await page.evaluate(() => ({
    replyHidden: document.querySelector('#replyOutput')?.classList.contains('hidden'),
    errorHidden: document.querySelector('#errorState')?.classList.contains('hidden'),
    loadingHidden: document.querySelector('#loading')?.classList.contains('hidden'),
    analysisHidden: document.querySelector('#analysisPanel')?.classList.contains('hidden'),
    errorText: document.querySelector('#errorMessage')?.textContent?.trim(),
    replyText: document.querySelector('#replyContent')?.textContent?.trim(),
    threadStatus: document.querySelector('#threadStatus')?.textContent?.trim(),
  }));

  console.log(JSON.stringify(snapshot, null, 2));
  await context.close();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
