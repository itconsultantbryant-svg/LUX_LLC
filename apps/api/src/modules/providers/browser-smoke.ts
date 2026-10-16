/* eslint-disable @typescript-eslint/no-explicit-any -- Optional CDP harness consumes heterogeneous protocol responses. */
import type { FastifyInstance } from 'fastify';
import { writeFile } from 'node:fs/promises';

// Optional local Chrome check. All API requests go to the isolated test application.
export async function browserSmoke(
  app: FastifyInstance,
  managerCookie: string,
  customerCookie: string,
) {
  const tabs = (await (
    await fetch('http://127.0.0.1:9224/json', { signal: AbortSignal.timeout(15000) })
  ).json()) as {
    type: string;
    webSocketDebuggerUrl: string;
  }[];
  const tab = tabs.find((t) => t.type === 'page');
  if (!tab) throw Error('Start test Chrome on debugging port 9224');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(Error('Chrome connection failed'));
  });
  let seq = 0,
    cookie = managerCookie;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  function send(method: string, params: Record<string, unknown> = {}) {
    return new Promise<any>((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('Chrome command timed out: ' + method));
      }, 60000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  ws.onmessage = async (event) => {
    const m = JSON.parse(String(event.data));
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        if (m.error) p.reject(Error(m.error.message));
        else p.resolve(m.result);
      }
    }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      try {
        const u = new URL(request.url);
        const r = await app.inject({
          method: request.method,
          url: u.pathname + u.search,
          headers: { cookie, ...(request.postData ? { 'content-type': 'application/json' } : {}) },
          ...(request.postData ? { payload: request.postData } : {}),
        });
        await send('Fetch.fulfillRequest', {
          requestId,
          responseCode: r.statusCode,
          responseHeaders: [
            {
              name: 'content-type',
              value: String(r.headers['content-type'] ?? 'application/json'),
            },
            { name: 'cache-control', value: 'no-store' },
          ],
          body: r.rawPayload.toString('base64'),
        });
      } catch {
        await send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
      }
    }
  };
  async function evaluate(expression: string) {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
    return r.result.value;
  }
  async function wait(expression: string) {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw Error(
      'Browser timed out: ' +
        expression +
        '\n' +
        (await evaluate('document.body.innerText.slice(0,3000)')),
    );
  }
  try {
    await send('Page.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:5175/api/*' }] });
    for (const width of [360, 1280]) {
      console.log('Browser provider width', width);
      cookie = managerCookie;
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width === 360,
      });
      await send('Page.navigate', { url: 'http://127.0.0.1:5175/institutional/provider' });
      await wait('document.body.innerText.includes("Create itemized bill")');
      await wait('!!document.querySelector("img[alt*=QR]")');
      if (await evaluate('document.documentElement.scrollWidth > innerWidth'))
        throw Error('Provider layout overflows ' + width);
      console.log('Provider layout and QR passed', width);
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      await writeFile(`/tmp/lux-provider-${width}.png`, Buffer.from(shot.data, 'base64'));
      console.log('Browser customer width', width);
      cookie = customerCookie;
      await send('Page.navigate', { url: 'http://127.0.0.1:5175/pay' });
      await wait('document.body.innerText.includes("SYNTHETIC Care Clinic")');
      if (await evaluate('document.documentElement.scrollWidth > innerWidth'))
        throw Error('Customer care layout overflows ' + width);
    }
  } finally {
    await send('Fetch.disable');
    await send('Page.navigate', { url: 'about:blank' });
    ws.close();
  }
}
