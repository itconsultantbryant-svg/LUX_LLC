import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CustomerHome } from '../pages/CustomerHome';
import { InstitutionalPage } from '../pages/InstitutionalPage';
import { DemoContext, initialDemo } from './demo';

describe('unconnected service boundaries', () => {
  it('does not show invented balances or a demo entry by default', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerHome />
      </MemoryRouter>,
    );
    expect(html).toContain('LRD Balance');
    expect(html).not.toContain('Try Demo');
    expect(html).not.toContain('12,500.00');
    expect(html).toContain('Wallet &amp; transactions');
    expect(html).not.toContain('Insurance Status');
  });
  it('direct institutional routes do not expose demo records outside demo mode', () => {
    for (const role of ['provider', 'reviewer', 'sponsor', 'partner', '__proto__']) {
      const html = renderToStaticMarkup(
        <DemoContext.Provider value={{ state: initialDemo, allowed: false, dispatch: () => {} }}>
          <MemoryRouter initialEntries={[`/institutional/${role}`]}>
            <Routes>
              <Route path="/institutional/:role" element={<InstitutionalPage />} />
            </Routes>
          </MemoryRouter>
        </DemoContext.Provider>,
      );
      expect(html).not.toContain('Demo consultation bill');
      expect(html).not.toContain('Preview workspace');
      expect(html).toMatch(/provisioned account|invitation/);
    }
  });
});
