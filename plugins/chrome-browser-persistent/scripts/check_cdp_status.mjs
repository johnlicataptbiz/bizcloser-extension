const endpoint = process.env.CDP_ENDPOINT || `http://127.0.0.1:${process.env.CHROME_DEBUG_PORT || 9222}`;

const response = await fetch(`${endpoint}/json/version`);
if (!response.ok) {
  console.error(`CDP check failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const info = await response.json();
console.log(JSON.stringify({
  ok: true,
  endpoint,
  browser: info.Browser,
  websocketDebuggerUrl: info.webSocketDebuggerUrl
}, null, 2));
