import { spawn } from "node:child_process";
const port = 9264;
const chrome = spawn("chromium", [
  "--headless=new", `--remote-debugging-port=${port}`,
  "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--user-data-dir=/tmp/chrome-cinch-layout2", "about:blank",
], { stdio: "ignore" });
let targets = null;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 500));
  try { targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json()); if (targets.length) break; } catch {}
}
const page = targets.find(t => t.type === "page") || targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id; pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
  }
};
await new Promise(r => ws.onopen = r);
await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: "http://127.0.0.1:3993/" });
await new Promise(r => setTimeout(r, 9000));
const result = await send("Runtime.evaluate", { expression: `
  (() => {
    const sec = document.querySelectorAll('section.shell')[1]; // problem section
    const cs = getComputedStyle(sec);
    const inner = sec.firstElementChild;
    return {
      sectionPadding: cs.padding,
      sectionPaddingLeft: cs.paddingLeft,
      innerMaxWidth: inner ? getComputedStyle(inner).maxWidth : null,
      innerWidth: inner ? Math.round(inner.getBoundingClientRect().width) : null,
      viewport: window.innerWidth,
    };
  })()
`, returnByValue: true });
console.log(JSON.stringify(result.result.value, null, 2));
ws.close(); chrome.kill(); process.exit(0);
