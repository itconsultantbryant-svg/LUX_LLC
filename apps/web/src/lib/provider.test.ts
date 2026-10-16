import { expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { providerFromQr } from './provider';
it('round-trips a provider QR while rejecting foreign origins and non-provider URLs', () => {
  const origin = 'https://wallet.example';
  const id = '5fde3857-c567-4654-aeb1-347d98d668b2';
  const url = `${origin}/pay?provider=${id}`;
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const scale = 5,
    margin = 4,
    size = (qr.modules.size + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / scale) - margin,
        col = Math.floor(x / scale) - margin;
      const dark =
        row >= 0 &&
        col >= 0 &&
        row < qr.modules.size &&
        col < qr.modules.size &&
        qr.modules.get(row, col);
      if (dark) {
        const offset = (y * size + x) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
    }
  const decoded = jsQR(pixels, size, size);
  expect(decoded?.data).toBe(url);
  expect(providerFromQr(decoded!.data, origin)).toBe(id);
  for (const bad of [
    `https://evil.example/pay?provider=${id}`,
    `${origin}/other?provider=${id}`,
    `${origin}/pay?provider=verified`,
    'javascript:alert(1)',
  ])
    expect(() => providerFromQr(bad, origin)).toThrow();
});
