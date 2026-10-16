import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extractText, looksBinary, pageForOffset } from './parse.js';

function pdfWith(content: string): Buffer {
  const deflated = deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([
    Buffer.from(
      `%PDF-1.4\n1 0 obj\n<< /Length ${deflated.length} /Filter /FlateDecode >>\nstream\n`,
      'latin1',
    ),
    deflated,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
}

describe('extractText', () => {
  it('reads plain text documents', () => {
    const parsed = extractText(
      Buffer.from('SYNTHETIC Care Clinic\nTotal 125.50 LRD'),
      'text/plain',
    );
    expect(parsed.unreadable).toBe(false);
    expect(parsed.text).toContain('SYNTHETIC Care Clinic');
    expect(parsed.pageCount).toBe(1);
  });

  it('marks binary or empty text as unreadable', () => {
    const parsed = extractText(Buffer.from([0x00, 0x01, 0x02, 0x00]), 'text/plain');
    expect(parsed.unreadable).toBe(true);
    expect(parsed.reason).toBe('unreadable_text');
    expect(parsed.text).toBe('');
  });

  it('marks images as unreadable without OCR', () => {
    const parsed = extractText(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
    expect(parsed.unreadable).toBe(true);
    expect(parsed.reason).toBe('image_ocr_unavailable');
  });

  it('extracts text from FlateDecode PDF content streams', () => {
    const parsed = extractText(
      pdfWith('BT (SYNTHETIC Care Clinic) Tj T* (Total 125.50 LRD) Tj ET'),
      'application/pdf',
    );
    expect(parsed.unreadable).toBe(false);
    expect(parsed.text).toContain('SYNTHETIC Care Clinic');
    expect(parsed.text).toContain('Total 125.50 LRD');
  });

  it('marks PDFs with no extractable text as unreadable', () => {
    const parsed = extractText(pdfWith('BT () Tj ET'), 'application/pdf');
    expect(parsed.unreadable).toBe(true);
    expect(parsed.reason).toBe('no_extractable_text');
  });
});

describe('looksBinary', () => {
  it('detects printable text', () => {
    expect(looksBinary('hello world')).toBe(false);
    expect(looksBinary('bad\u0000text')).toBe(true);
  });
});

describe('pageForOffset', () => {
  it('maps offsets to the correct page', () => {
    const parsed = { pages: ['page-one', 'page-two'] };
    expect(pageForOffset(parsed, 0)).toBe(1);
    expect(pageForOffset(parsed, 9)).toBe(2);
  });
});
