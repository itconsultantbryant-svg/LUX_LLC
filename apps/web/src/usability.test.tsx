import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from './components/AppShell';
import { Feedback, NetworkNotice } from './components/Feedback';
import { CustomerHome } from './pages/CustomerHome';
import { DemoContext, initialDemo } from './features/demo';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const globalCss = readFileSync(new URL('./styles/global.css', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('./styles/workspace.css', import.meta.url), 'utf8');

function renderShell() {
  return renderToStaticMarkup(
    <DemoContext.Provider value={{ state: initialDemo, allowed: false, dispatch: () => {} }}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<CustomerHome />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </DemoContext.Provider>,
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true, writable: true });
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', {
    value: undefined,
    configurable: true,
    writable: true,
  });
});

describe('document shell supports mobile devices', () => {
  it('declares a responsive viewport that fits notched screens', () => {
    expect(indexHtml).toMatch(/name="viewport"/);
    expect(indexHtml).toContain('width=device-width');
    expect(indexHtml).toContain('initial-scale=1.0');
    expect(indexHtml).toContain('viewport-fit=cover');
  });

  it('declares a document language for assistive technology', () => {
    expect(indexHtml).toMatch(/<html lang="en">/);
  });

  it('ships small-screen layout rules and honours reduced motion', () => {
    expect(workspaceCss).toMatch(/@media \(max-width: 820px\)/);
    expect(globalCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe('primary screen landmarks and navigation', () => {
  const html = renderShell();

  it('offers a skip link to the main content', () => {
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('Skip to content');
  });

  it('exposes a focusable main landmark and a labelled primary nav', () => {
    expect(html).toContain('id="main-content"');
    expect(html).toMatch(/<main[^>]*tabindex="-1"/);
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('aria-label="Secondary"');
  });

  it('renders the customer home heading and a path to sign in', () => {
    expect(html).toContain('Your health. Your next step.');
    expect(html).toContain('Customer sign in');
  });
});

describe('feedback surfaces are announced to assistive technology', () => {
  it('announces errors assertively', () => {
    const html = renderToStaticMarkup(
      <Feedback kind="error" title="We could not reach HealthWallet." />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
  });

  it('marks loading states busy and polite', () => {
    const html = renderToStaticMarkup(<Feedback kind="loading" title="Checking connection…" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
  });
});

describe('weak-connectivity recovery', () => {
  it('shows a recoverable offline notice when the device is offline', () => {
    setOnline(false);
    const html = renderToStaticMarkup(<NetworkNotice />);
    expect(html).toContain('You are offline.');
    expect(html).toContain('Check your connection');
    expect(html).toContain('Retry connection');
  });

  it('stays quiet when the device reports being online', () => {
    setOnline(true);
    const html = renderToStaticMarkup(<NetworkNotice />);
    expect(html).not.toContain('You are offline.');
  });
});
