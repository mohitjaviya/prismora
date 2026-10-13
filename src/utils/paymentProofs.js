/**
 * Proof of a partner payment (Gap 8, 099): a receipt, screenshot or cheque
 * scan. Kept in the private Storage bucket "payment-proofs" under the
 * partner's id; only full Accounting can upload, read or delete (099), and it
 * is opened by a short-lived signed link, never a public one. The bucket also
 * enforces the size and type limits below.
 */
import { contentTypeFor, attachmentPath } from './leadAttachments';

export const PAYMENT_PROOF_BUCKET = 'payment-proofs';
export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
export const PROOF_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic';

/** Why a file cannot be the proof, or null if it can. */
export const proofFileProblem = (file) => {
  if (!file) return 'No file chosen.';
  if (!PROOF_TYPES.includes(contentTypeFor(file))) return `"${file.name}" is not a PDF or image.`;
  if (file.size > MAX_PROOF_BYTES) return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.`;
  return null;
};

/** Where it is kept: under the partner (099 checks the first folder is the partner). */
export const proofPath = (partyId, fileName, stamp = Date.now()) => attachmentPath(partyId, fileName, stamp);
