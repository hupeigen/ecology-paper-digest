import test from 'node:test';
import assert from 'node:assert/strict';
import {planReports,normalizeKind} from '../scripts/update.mjs';
test('auto month-start Monday includes prior archive and current provisional',()=>{const p=planReports('2027-02-01','auto');assert.deepEqual(p.filter(p=>p.kind==='monthly').map(p=>[p.reportId,p.status]),[['2027-01','archived'],['2027-02','provisional']]);assert.deepEqual(normalizeKind('auto','2027-02-01'),['daily','weekly','monthly']);});
test('explicit leap-month archive and year rollover',()=>{assert.equal(planReports('2024-03-01','monthly','2024-02')[0].period.to,'2024-02-29');assert.equal(planReports('2027-01-01','auto').find(p=>p.kind==='monthly').reportId,'2026-12');assert.throws(()=>planReports('2026-10-12','monthly','2026-11'));assert.throws(()=>planReports('2026-10-12','daily','2026-10'));});
