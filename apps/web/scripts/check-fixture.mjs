// Run Chrome with --headless --remote-debugging-port=9223 and a temporary profile first.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
const targets = await (
  await fetch(`http://127.0.0.1:${process.env.CHROME_PORT || '9225'}/json`)
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

const pause = () => new Promise((resolve) => setTimeout(resolve, 150));
async function clickText(text) {
  await evaluate(
    `(()=>{const el=[...document.querySelectorAll('button,a')].find(el=>el.textContent.trim()===${JSON.stringify(text)}); if(!el)throw new Error('Missing control: '+${JSON.stringify(text)});el.click();})()`,
  );
  await pause();
}
async function link(path) {
  await evaluate(`document.querySelector('a[href="${path}"]').click()`);
  await pause();
}
async function fits(width, label) {
  const dimensions = await evaluate(
    `({width:innerWidth,scroll:document.documentElement.scrollWidth,nav:[...document.querySelectorAll('.shell__nav a')].map(a=>({width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height}))})`,
  );
  assert(
    dimensions.scroll <= dimensions.width,
    `Overflow ${width} ${label}: ${JSON.stringify(dimensions)}`,
  );
  assert(
    dimensions.nav.every((r) => r.width >= 44 && r.height >= 44),
    'Small navigation targets',
  );
  console.log(`PASS ${width}px ${label}`);
}
await mkdir('/tmp/lux-screenshots', { recursive: true });
try {
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  for (let attempt = 0; attempt < 75; attempt++) {
    if (await evaluate(`!!document.querySelector('main h1')`)) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert(
    await evaluate(`!!document.querySelector('main h1')`),
    'App must be loaded from file:///tmp/lux-design-fixture.html',
  );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 821,
    });
    await link('/');
    if (await evaluate(`!!document.querySelector('.demo-session')`))
      await clickText('Exit demo & reset');
    if (
      await evaluate(
        `!![...document.querySelectorAll('button')].find(el=>el.textContent==='Try Demo')`,
      )
    )
      await clickText('Try Demo');
    await fits(width, 'home');
    assert(
      await evaluate(`[...document.images].every(image=>image.complete&&image.naturalWidth>0)`),
      'Brand images loaded',
    );
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    });
    await writeFile(`/tmp/lux-screenshots/customer-${width}.png`, Buffer.from(shot.data, 'base64'));
    for (const [path, choice, confirm] of [
      ['/pay', 'Demo Community Clinic', 'Simulate payment'],
      ['/save', 'Demo mobile wallet', 'Simulate savings'],
      ['/support', 'Consultation', 'Submit demo request'],
    ]) {
      await link('/');
      await link(path);
      await fits(width, path);
      await clickText('Review details');
      assert(
        await evaluate(`!!document.querySelector('[role="alert"]')`),
        'Required choice feedback',
      );
      await evaluate(
        `(()=>{const select=document.querySelector('select');select.value=${JSON.stringify(choice)};select.dispatchEvent(new Event('change',{bubbles:true}));const input=document.querySelector('#flow-amount');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'100.50');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await pause();
      await clickText('Review details');
      assert(
        await evaluate(
          `document.querySelector('[aria-current="step"]').textContent.includes('Review')`,
        ),
        'Review step',
      );
      await fits(width, path + ' review');
      await clickText(confirm);
      await new Promise((resolve) => setTimeout(resolve, 700));
      assert(
        await evaluate(
          `document.querySelector('[aria-current="step"]').textContent.includes('Confirmation')`,
        ),
        'Confirmation step',
      );
      assert(
        await evaluate(`document.activeElement.tagName==='H2'`),
        'Confirmation receives keyboard focus',
      );
      await fits(width, path + ' success');
    }
    await link('/history');
    await fits(width, 'history');
    for (const role of ['provider', 'reviewer', 'sponsor', 'partner']) {
      await link('/institutional');
      await link('/institutional/' + role);
      await fits(width, role);
      await evaluate(`document.querySelector('.institution-list button').click()`);
      await pause();
      assert(
        await evaluate(`!!document.querySelector('[aria-label="Review details"]')`),
        'Review opened',
      );
      await evaluate(
        `document.querySelector('[aria-label="Review details"] .btn--primary').click()`,
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      assert(
        await evaluate(`!!document.querySelector('.feedback--success')`),
        'Review acknowledgement',
      );
    }
  }
  await link('/');
  await evaluate(
    `document.querySelector('.secondary-menu summary').focus();document.querySelector('.secondary-menu').open=true`,
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  assert(await evaluate(`!document.querySelector('.secondary-menu').open`), 'Escape closes More');
  await evaluate(
    `Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'))`,
  );
  await pause();
  assert(
    await evaluate(
      `document.querySelector('.network-notice').textContent.includes('You are offline')`,
    ),
    'Offline feedback',
  );
  await evaluate(
    `window.__originalFetch=window.fetch;window.fetch=()=>Promise.reject(new Error('network'))`,
  );
  await clickText('Retry connection');
  assert(
    await evaluate(
      `document.querySelector('.network-notice').textContent.includes('could not reach')`,
    ),
    'Network retry error',
  );
  await evaluate(
    `Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.fetch=()=>Promise.resolve(new Response('{}',{status:200}))`,
  );
  await clickText('Retry connection');
  assert(
    await evaluate(
      `document.querySelector('.network-notice').textContent.includes('Connection restored')`,
    ),
    'Network retry success',
  );
  await clickText('Dismiss');
  await evaluate(`window.fetch=window.__originalFetch`);
  await clickText('Exit demo & reset');
  assert(
    await evaluate(`document.querySelector('.balance').textContent==='LRD —'`),
    'Demo exit clears wallet',
  );
  console.log('PASS keyboard menu, offline retry, and demo reset');
} finally {
  ws.close();
}
