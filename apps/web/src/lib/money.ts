/** Formats exact minor units without converting money to Number. */
export function formatMinor(value: string, currency: string): string {
  if (!/^-?[0-9]+$/.test(value) || !/^[A-Z]{3}$/.test(currency))
    throw new Error('Invalid exact money value');
  const digits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(digits);
  const signed = BigInt(value),
    amount = signed < 0n ? -signed : signed;
  const whole = (amount / scale).toLocaleString('en-US');
  const fraction = digits ? `.${(amount % scale).toString().padStart(digits, '0')}` : '';
  return `${currency} ${signed < 0n ? '-' : ''}${whole}${fraction}`;
}

export function decimalMinor(value: string): string {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a positive amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const n = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (n <= 0n || n > 9223372036854775807n)
    throw new Error('Amount is outside the supported range.');
  return n.toString();
}
