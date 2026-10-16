// Run Chrome with --headless --remote-debugging-port=9223 and a temporary profile first.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const targets = await (
  await fetch(`http://127.0.0.1:${process.env.CHROME_PORT || '9223'}/json`)
).json();
const ws = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  const handler = pending.get(message.id);
  if (handler) {
    pending.delete(message.id);
    message.error ? handler.reject(message.error) : handler.resolve(message.result);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => {
      pending.delete(key);
      reject(new Error(`Timed out: ${method}`));
    }, 45000);
    pending.set(key, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
await send('Page.enable');
await mkdir('/tmp/lux-screenshots', { recursive: true });
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    for (const route of [
      '/',
      '/pay',
      '/support',
      '/history',
      '/account',
      '/institutional',
      '/institutional/provider',
      '/institutional/reviewer',
      '/institutional/sponsor',
      '/institutional/partner',
    ]) {
      await send('Page.navigate', { url: base + route });
      await evaluate(
        `new Promise(resolve => { const timer = setInterval(() => { if (document.querySelector('main h1') && [...document.images].every(i => i.complete)) { clearInterval(timer); resolve(true); } }, 100); setTimeout(() => {clearInterval(timer);resolve(false)}, 15000) })`,
      );
      const result = await evaluate(
        `({ width: innerWidth, scroll: document.documentElement.scrollWidth, logo: [...document.images].some(i => i.alt === 'LUX AI' && i.naturalWidth > 0), heading: document.querySelector('main h1')?.textContent, nav: [...document.querySelectorAll('.shell__nav a')].map(a => ({width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height})) })`,
      );
      assert(result.heading, `Missing heading ${route}`);
      assert(result.logo, `Missing logo ${route}`);
      assert(
        result.scroll <= result.width,
        `Horizontal overflow ${width} ${route}: ${JSON.stringify(result)}`,
      );
      assert(
        result.nav.every((r) => r.width >= 44 && r.height >= 44),
        `Small navigation targets ${width}`,
      );
      console.log(`PASS ${width}px ${route}`);
      if (route === '/') {
        const shot = await send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
        });
        await writeFile(`/tmp/lux-screenshots/home-${width}.png`, Buffer.from(shot.data, 'base64'));
        await evaluate(`document.querySelector('.install__button').click()`);
        assert(
          await evaluate(`document.querySelector('dialog').open`),
          'Install instructions did not open',
        );
        await evaluate(`document.querySelector('dialog button').click()`);
        assert(
          !(await evaluate(`document.querySelector('dialog').open`)),
          'Install instructions did not close',
        );
      }
    }
  }
} finally {
  ws.close();
}
