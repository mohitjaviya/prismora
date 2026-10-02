import { as } from '../../fix-batch-6/rest-as.mjs';
import { readFileSync } from 'node:fs';
const env = {}; for (const l of readFileSync('D:/PRISMORA/.env.test-accounts.local','utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
const tag = env.TEST_G_TAG; const SA = await as('SUPER_ADMIN');
const ui = (await SA(`users?select=id,name,role,status&email=eq.test.g.ui.${tag}@prismora.test`)).body[0];
const dp = (await SA(`users?select=id,status&email=eq.test.g.dispatch_team.${tag}@prismora.test`)).body[0];
const show = async (id) => (await SA(`audit_log?select=at,actor_name,actor_role,action,changes,via&row_id=eq.${id}&order=at.asc`)).body;
console.log('UI-created user now:', JSON.stringify(ui));
for (const r of await show(ui.id)) console.log(`  ${r.action} by ${r.actor_name} (${r.actor_role}) ${JSON.stringify(r.changes).slice(0, 170)}`);
console.log('Dispatch user (UI deactivate/reactivate):');
for (const r of (await show(dp.id))) console.log(`  ${r.action} by ${r.actor_name} (${r.actor_role}) ${JSON.stringify(r.changes).slice(0, 120)}`);
