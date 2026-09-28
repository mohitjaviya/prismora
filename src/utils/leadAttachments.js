/**
 * Lead attachments (D-21): what may be stored, and where.
 *
 * Kept in the private Storage bucket "lead-attachments" under the lead's id,
 * and guarded by the lead's own rules in the database (migration 059). The
 * bucket also enforces the size and type limits below; checking them here
 * first gives a plain message before anything is sent.
 */
export const LEAD_ATTACHMENT_BUCKET = 'lead-attachments';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ALLOWED = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const ACCEPT_ATTR = Object.keys(ALLOWED).map(e => `.${e}`).join(',');
export const ALLOWED_LABEL = 'PDF, images, Word or Excel, up to 10 MB';

const extension = (name) => String(name || '').split('.').pop().toLowerCase();

/** The type Storage should record: the browser's, else from the extension. */
export const contentTypeFor = (file) => {
  const known = Object.values(ALLOWED);
  if (file?.type && known.includes(file.type)) return file.type;
  return ALLOWED[extension(file?.name)] || file?.type || '';
};

/** Why a file cannot be attached, or null if it can. */
export const attachmentError = (file) => {
  if (!file) return 'No file chosen.';
  if (!contentTypeFor(file) || !Object.values(ALLOWED).includes(contentTypeFor(file))) {
    return `"${file.name}" is not a PDF, image, Word or Excel file.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.`;
  }
  return null;
};

/** Where a file is kept: under the lead, with a time prefix so names never collide. */
export const attachmentPath = (leadId, fileName, stamp = Date.now()) => {
  const safe = String(fileName || 'file').replace(/[^\w.\- ()]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
  return `${leadId}/${stamp}-${safe}`;
};

/** The file name as uploaded, without the time prefix. */
export const attachmentDisplayName = (objectName) => String(objectName || '').replace(/^\d+-/, '');
