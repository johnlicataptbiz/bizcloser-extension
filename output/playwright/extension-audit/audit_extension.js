const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const extensionPath = repoRoot;
const artifactDir = __dirname;
const userDataDir = path.join(__dirname, 'user-data', String(Date.now()));

const sampleThread = [
  'Lead: Hey I have all 4 qualifiers and my practice is already cash based.',
  'Setter: Love that. What are you most trying to solve right now?',
  'Lead: I need help getting more evals consistently and want a real strategy.',
  'Setter: Makes sense.',
].join('\n');

const analysisResponse = {
  summary: 'Lead already has the four qualifiers and is asking for a concrete growth plan.',
  intent: 'Warm and qualified. Ready for the next step if the message is decisive.',
  recommendedAngle: 'All four qualifiers known with core fit. Pitch strategy call using proven call block and ask weekdays plus AM or PM.',
  objections: ['Needs clarity on the plan before committing time.'],
  confidence: 'High'
};

const generateResponse = {
  reply: 'Totally makes sense. What kind of eval volume are you aiming for each month?'
};

function buildRefineResponse(editInstruction = '') {
  const lowered = editInstruction.toLowerCase();

  if (lowered.includes('shorter')) {
    return {
      reply: 'Love that. This is exactly what we map out on a strategy call for cash based practices so you know the clearest path either way. What weekdays are better for you, and do you prefer AM or PM?',
      changes: ['Shortened the message', 'Kept the direct call invite'],
      verdict: 'Shortened while preserving the strategy-call close.'
    };
  }

  return {
    reply: 'Love that. Since you already have the core fit, this is exactly what we map out on a strategy call specialized for cash based practices so you can see the clearest next step either way. What weekdays are better for you, and do you prefer AM or PM?',
    changes: ['Shifted from soft qualification to direct strategy-call invite', 'Added clear scheduling question'],
    verdict: 'Final reply now matches the recommended angle.'
  };
}

async function mockBizCloserApi(context) {
  await context.route('**/api/bizcloser/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const routeName = url.pathname.split('/').pop();
    const payload = request.postDataJSON ? request.postDataJSON() : {};

    if (routeName === 'analyze') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analysisResponse)
      });
    }

    if (routeName === 'generate') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(generateResponse)
      });
    }

    if (routeName === 'refine') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildRefineResponse(payload.editInstruction || ''))
      });
    }

    if (routeName === 'history' || routeName === 'feedback') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unhandled mocked route: ${routeName}` })
    });
  });
}

async function waitForExtensionId(context) {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  const workerUrl = serviceWorker.url();
  const match = workerUrl.match(/chrome-extension:\/\/([a-z]{32})\//);
  if (!match) {
    throw new Error(`Could not determine extension id from ${workerUrl}`);
  }

  return match[1];
}

async function saveSnapshot(page, name) {
  const target = path.join(artifactDir, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function run() {
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    await mockBizCloserApi(context);
    const extensionId = await waitForExtensionId(context);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.setViewportSize({ width: 440, height: 920 });

    await page.waitForSelector('#threadInput');
    await saveSnapshot(page, '01-empty-state');

    await page.fill('#threadInput', sampleThread);
    await page.click('#primaryActionBtn');
    await page.waitForSelector('#replyOutput:not(.hidden)');
    await page.waitForSelector('#analysisPanel:not(.hidden)');
    await page.waitForFunction(() => {
      const reply = document.querySelector('#replyContent');
      return !!reply && reply.textContent && reply.textContent.toLowerCase().includes('strategy call');
    });
    await saveSnapshot(page, '02-generated-reply');

    await page.click('#openRevisionBtn');
    await page.fill('#manualEditInput', 'Make this shorter and keep the direct strategy-call ask.');
    await page.click('#applyEditBtn');
    await page.waitForFunction(() => {
      const reply = document.querySelector('#replyContent');
      return !!reply && reply.textContent && reply.textContent.startsWith('Love that.');
    });
    await saveSnapshot(page, '03-manual-edit');

    await page.click('#replyDownBtn');
    await page.click('#copyBtn');
    await page.click('#replySaveNextBtn');
    await page.waitForSelector('#emptyState:not(.hidden)');
    await saveSnapshot(page, '04-after-save-next');

    const localStorageDump = await page.evaluate(() => ({
      history: localStorage.getItem('bizcloser_history_v1'),
      measurements: localStorage.getItem('bizcloser_measurements_v1')
    }));

    const result = {
      extensionId,
      screenshots: [
        '01-empty-state.png',
        '02-generated-reply.png',
        '03-manual-edit.png',
        '04-after-save-next.png'
      ],
      localStorageDump
    };

    fs.writeFileSync(
      path.join(artifactDir, 'audit-results.json'),
      JSON.stringify(result, null, 2)
    );

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
