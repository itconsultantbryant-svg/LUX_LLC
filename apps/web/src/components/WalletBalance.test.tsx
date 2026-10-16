import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WalletDetails, type WalletData } from './WalletBalance';
it('keeps currencies and unavailable balances distinct and describes source rules', () => {
  const data: WalletData = {
    balanceBasis: 'platform_ledger',
    partnerFundsVerified: false,
    currencies: [
      {
        currency: 'LRD',
        balances: { available: '1000', reserved: '200', pending: '300', restricted: '400' },
        allocations: [
          {
            id: 'synthetic',
            source: 'employer_benefits',
            balances: { available: '1000', reserved: '200', pending: '300', restricted: '400' },
            expiresAt: null,
            allowedCategories: ['outpatient'],
            allowedProviderIds: ['clinic'],
            dependentId: null,
            programId: 'program',
            status: 'active',
            maxPerPaymentMinor: '500',
          },
        ],
      },
      {
        currency: 'USD',
        balances: { available: '9007199254740993', reserved: '0', pending: '0', restricted: '0' },
        allocations: [],
      },
    ],
  };
  const html = renderToStaticMarkup(<WalletDetails data={data} />);
  expect(html).toContain('LRD 10.00');
  expect(html).toContain('LRD 2.00');
  expect(html).toContain('LRD 3.00');
  expect(html).toContain('LRD 4.00');
  expect(html).toContain('USD 90,071,992,547,409.93');
  expect(html).toContain('Employer benefits');
  expect(html).toContain('outpatient');
  expect(html).toContain('do not confirm money held by a payment partner');
  expect(html).not.toContain('Combined balance');
});
