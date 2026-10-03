// RISK-ATT (1) storage rules as real roles, rolled back: who may add, see and remove a lead's files.
// L11 belongs to TEST Sales Exec 1 (in TEST Sales Manager's team). Only the object row is written (no bytes).
import { run } from './rolerun.mjs';
const ins = (lead) => `INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('lead-attachments','${lead}/1-TEST-P4.pdf','{"size":3,"mimetype":"application/pdf"}')`;
const SEE = `SELECT name FROM storage.objects WHERE bucket_id='lead-attachments' AND name LIKE 'L11/%'`;
const DEL = `DELETE FROM storage.objects WHERE bucket_id='lead-attachments' AND name LIKE 'L11/%'`;
const steps = [
  { who: 'SALES_EXEC_1', id: 'T1-owner-adds', write: true, sql: ins('L11') },
  { who: 'SALES_EXEC_2', id: 'T2-other-exec-adds', write: true, sql: ins('L11') },
  { who: 'DISTRIBUTOR', id: 'T3-partner-adds', write: true, sql: ins('L11') },
  { who: 'DIRECTOR', id: 'T4-view-only-adds', write: true, sql: ins('L11') },
  { who: 'ADMIN', id: 'T5-admin-adds-no-such-lead', write: true, sql: ins('L-NO-SUCH-LEAD') },
  { who: 'SALES_EXEC_1', id: 'S1-owner-sees', sql: SEE },
  { who: 'SALES_MANAGER', id: 'S2-manager-sees', sql: SEE },
  { who: 'DIRECTOR', id: 'S3-director-sees', sql: SEE },
  { who: 'SALES_EXEC_2', id: 'S4-other-exec-sees', sql: SEE },
  { who: 'DISTRIBUTOR', id: 'S5-partner-sees', sql: SEE },
  { who: 'ACCOUNTS', id: 'S6-accounts-sees', sql: SEE },
  { who: 'SALES_EXEC_2', id: 'D1-other-exec-removes', write: true, sql: DEL },
  { who: 'DIRECTOR', id: 'D2-view-only-removes', write: true, sql: DEL },
  { who: 'SALES_EXEC_1', id: 'D3-owner-removes', write: true, sql: DEL },
];
const out = run(steps);
for (const s of steps) console.log(`${s.id.padEnd(30)} ${out[s.id].ok ? 'OK     ' : 'REFUSED'} ${out[s.id].text.replace(/\\"/g, '"')}`);
