import { describe, it, expect } from 'vitest';
import { attachmentError, attachmentPath, attachmentDisplayName, contentTypeFor, MAX_ATTACHMENT_BYTES } from '../leadAttachments';

const file = (name, size = 1000, type = '') => ({ name, size, type });

describe('lead attachments', () => {
  it('accepts PDF, images, Word and Excel', () => {
    for (const n of ['a.pdf', 'b.JPG', 'c.png', 'd.docx', 'e.doc', 'f.xlsx', 'g.xls', 'h.webp']) {
      expect(attachmentError(file(n))).toBeNull();
    }
  });

  it('refuses other types, whatever the browser calls them', () => {
    expect(attachmentError(file('run.exe', 10, 'application/x-msdownload'))).toMatch(/not a PDF/);
    expect(attachmentError(file('notes.txt', 10, 'text/plain'))).toMatch(/not a PDF/);
    expect(attachmentError(file('page.html', 10, 'text/html'))).toMatch(/not a PDF/);
  });

  it('refuses anything over 10 MB', () => {
    expect(attachmentError(file('big.pdf', MAX_ATTACHMENT_BYTES + 1))).toMatch(/10 MB/);
    expect(attachmentError(file('ok.pdf', MAX_ATTACHMENT_BYTES))).toBeNull();
  });

  it('works out the type from the extension when the browser gives none', () => {
    expect(contentTypeFor(file('quote.xlsx'))).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('keeps files under the lead, safely named, and shows the original name', () => {
    const p = attachmentPath('L12', 'Price list (final)/v2?.pdf', 1790000000000);
    expect(p).toBe('L12/1790000000000-Price list (final)_v2_.pdf');
    expect(attachmentDisplayName(p.split('/')[1])).toBe('Price list (final)_v2_.pdf');
  });
});
