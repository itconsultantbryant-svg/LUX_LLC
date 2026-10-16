import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CustomerHome } from '../pages/CustomerHome';
import { InstitutionalPage } from '../pages/InstitutionalPage';
import { FlowPage } from '../pages/FlowPage';
import { DemoContext, initialDemo } from './demo';

describe('unconnected service boundaries', () => {
  it('does not show invented balances or a demo entry by default', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerHome />
      </MemoryRouter>,
    );
    expect(html).toContain('LRD —');
    expect(html).not.toContain('Try Demo');
    expect(html).not.toContain('12,500.00');
    expect(html).toContain('Institutional access');
  });
  it('does not render live payment forms without a demo session', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FlowPage flow="pay" />
      </MemoryRouter>,
    );
    expect(html).toContain('This service is not connected yet');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Try Demo');
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
