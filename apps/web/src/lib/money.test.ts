import { expect, it } from 'vitest';
import { formatMinor, decimalMinor } from './money';
it('formats large exact minor amounts without precision loss', () => {
  expect(formatMinor('9007199254740993', 'LRD')).toBe('LRD 90,071,992,547,409.93');
  expect(formatMinor('1', 'USD')).toBe('USD 0.01');
  expect(formatMinor('-100', 'USD')).toBe('USD -1.00');
  expect(formatMinor('123', 'JPY')).toBe('JPY 123');
  expect(() => formatMinor('1.5', 'USD')).toThrow();
});

it('parses deposit input exactly and rejects ambiguous or out-of-range money', () => {
  expect(decimalMinor('90071992547409.93')).toBe('9007199254740993');
  expect(decimalMinor('0.01')).toBe('1');
  for (const value of ['0', '-1', '1e3', '1.234', '01.00', 'NaN', '92233720368547758.08'])
    expect(() => decimalMinor(value)).toThrow();
});
