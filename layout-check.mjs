import { spawn } from "node:child_process";

const port = 9263;
const chrome = spawn("chromium", [
  "--headless=new", `--remote-debugging-port=${port}`,
  "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--user-data-dir=/tmp/chrome-cinch-layout", "about:blank",
], { stdio: "ignore" });

let targets = null;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 500));
  try {
    targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
    if (targets.length) break;
  } catch {}
}
if (!targets?.length) { console.log("CHROME FAILED"); process.exit(0); }
const page = targets.find(t => t.type === "page") || targets[0];

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  }
};

await new Promise(r => ws.onopen = r);
await send("Page.enable");
await send("Runtime.enable");

// Set phone viewport (390px)
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: "http://127.0.0.1:3993/" });
await new Promise(r => setTimeout(r, 9000));

const result = await send("Runtime.evaluate", { expression: `
  (() => {
    const sections = [...document.querySelectorAll('section')];
    const info = sections.map((s, i) => {
      const r = s.getBoundingClientRect();
      const firstText = s.querySelector('p, h2, h3, .feature-card');
      let textLeft = null, textRight = null;
      if (firstText) {
        const tr = firstText.getBoundingClientRect();
        textLeft = Math.round(tr.left);
        textRight = Math.round(tr.right);
      }
      return {
        i,
        sectionLeft: Math.round(r.left),
        sectionRight: Math.round(r.right),
        sectionWidth: Math.round(r.width),
        textLeft,
        textRight,
        textWidth: textLeft !== null ? textRight - textLeft : null,
        className: s.className.slice(0, 30),
      };
    });
    return info;
  })()
`, returnByValue: true });

console.log("=== SECTION LAYOUT @390px ===");
for (const s of result.result.value) {
  console.log(`#${s.i} [${s.className}] left=${s.sectionLeft} right=${s.sectionRight} w=${s.sectionWidth} | firstText left=${s.textLeft} right=${s.textRight} w=${s.textWidth}`);
}

ws.close();
chrome.kill();
process.exit(0);
