/** @vitest-environment jsdom */
// Legacy literals below are intentional migration inputs, never visible default branding.
import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {render,cleanup,screen,waitFor,fireEvent} from '@testing-library/react';
import App from '../src/App';
import {DemoProvider,migrateDemoBrand} from '../src/store';
import {createInitialState,type DemoState} from '../src/model';
const LEGACY='qinghe.health.demo.v1';
const CURRENT='hongchuang.health.demo.v1';
const stored=():DemoState=>JSON.parse(localStorage.getItem(CURRENT)!);
function legacyState(){
 const s=createInitialState();s.patients[0].phone='演示自定义客户9999';s.appointments=[{...s.appointments[0],id:'LEGACY-ORDER-KEEP',amount:723.45,note:'客户自定义业务备注应保留',results:{'空腹血糖':'6.7'},status:'in_exam'}];
 s.tasks=[{id:'LEGACY-TASK-KEEP',title:'保留用户创建的随访',patientId:'P001',status:'进行中',owner:'演示旧负责人',date:'2026-10-18'}];s.config.dailyCapacity=37;s.config.portalHospital={name:'青禾 · 健康中心',intro:'青禾旧版演示门户',hotline:'DEMO-KEEP'};
 s.records.reportTemplates=[{id:'TEMPLATE-KEEP',version:1,name:'用户维护的报告模板',heading:'青禾 · 合成健康报告',footer:'保留用户说明',sections:['customer','results']}];s.records.customBusiness=[{id:'BUSINESS-KEEP',amount:177.9,note:'保留自定义记录字段',data:{arbitrary:true}}];return s;
}
async function app(route='/dashboard'){window.location.hash='#'+route;render(<DemoProvider><App/></DemoProvider>);await waitFor(()=>expect(screen.queryByText(/正在加载/)).toBeNull());}
beforeEach(()=>{cleanup();localStorage.clear();});afterEach(cleanup);

describe('Independent brand migration: existing business data preserved',()=>{
 it('loads legacy data into the new key, replaces visible portal/template branding and preserves business identifiers and values',async()=>{
  const old=legacyState();const raw=JSON.stringify(old);localStorage.setItem(LEGACY,raw);await app('/patient');
  expect(screen.getByText('红创 · 健康中心')).toBeTruthy();expect(screen.queryByText('青禾 · 健康中心')).toBeNull();
  const next=stored();expect(next.appointments).toEqual(old.appointments);expect(next.tasks).toEqual(old.tasks);expect(next.patients).toEqual(old.patients);expect(next.records.customBusiness).toEqual(old.records.customBusiness);expect(next.config.dailyCapacity).toBe(37);
  expect(next.config.portalHospital).toMatchObject({name:'红创 · 健康中心',intro:'红创旧版演示门户',hotline:'DEMO-KEEP'});expect(next.records.reportTemplates[0]).toMatchObject({id:'TEMPLATE-KEEP',heading:'红创 · 合成健康报告',footer:'保留用户说明'});
  expect(next.audit.filter(a=>a.action==='BRAND_MIGRATION')).toHaveLength(1);expect(localStorage.getItem(LEGACY)).toBe(raw);
 });
 it('reloads the migrated key without losing later edits or duplicating the migration event',async()=>{
  localStorage.setItem(LEGACY,JSON.stringify(legacyState()));await app();
  fireEvent.change(screen.getByLabelText('选择院区'),{target:{value:'东院区'}});const changed=stored();cleanup();await app();
  expect(stored().config.campus).toBe('东院区');expect(stored().appointments).toEqual(changed.appointments);expect(stored().tasks).toEqual(changed.tasks);expect(stored().audit.filter(a=>a.action==='BRAND_MIGRATION')).toHaveLength(1);expect(screen.getByText('红创')).toBeTruthy();
 });
 it('prioritizes a valid current key over a divergent legacy key',async()=>{
  const old=legacyState();localStorage.setItem(LEGACY,JSON.stringify(old));const current=createInitialState();current.config.dailyCapacity=19;current.appointments=[{...current.appointments[1],id:'LATEST-ORDER',amount:456.78}];localStorage.setItem(CURRENT,JSON.stringify(current));await app();
  expect(stored().config.dailyCapacity).toBe(19);expect(stored().appointments[0]).toMatchObject({id:'LATEST-ORDER',amount:456.78});expect(stored().audit.some(a=>a.action==='BRAND_MIGRATION')).toBe(false);
 });
 it('falls back to valid legacy data if the current key is malformed without deleting the legacy copy',async()=>{
  const raw=JSON.stringify(legacyState());localStorage.setItem(LEGACY,raw);localStorage.setItem(CURRENT,'{broken');await app();
  expect(stored().appointments[0]).toMatchObject({id:'LEGACY-ORDER-KEEP',amount:723.45});expect(localStorage.getItem(LEGACY)).toBe(raw);
 });
 it('preserves technical identifiers and leaves the input state untouched while replacing readable Chinese/English labels',()=>{
  const old=legacyState();old.records.brandFixture=[{id:'qinghe-technical-id',patientId:'qinghe-patient-id',appointmentIds:['qinghe-order-id'],name:'QINGHE Qinghe qinghe 青禾 清和'}];const before=JSON.stringify(old);const next=migrateDemoBrand(old,true);
  expect(next.records.brandFixture[0]).toEqual({id:'qinghe-technical-id',patientId:'qinghe-patient-id',appointmentIds:['qinghe-order-id'],name:'HONGCHUANG Hongchuang hongchuang 红创 红创'});expect(JSON.stringify(old)).toBe(before);expect(migrateDemoBrand(next)).toEqual(next);
 });
});
