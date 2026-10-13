/** @vitest-environment jsdom */
// Independent v2 DOM-behavior verification, not browser or visual acceptance.
import {beforeEach,afterEach,it,describe,expect,vi} from 'vitest';
import {render,cleanup,screen,fireEvent,within,waitFor,act} from '@testing-library/react';
import App from '../src/App';
import {DemoProvider} from '../src/store';
import {createInitialState,type DemoState} from '../src/model';
import Health from '../src/modules/Health';
import Operations,{quoteCommerceOrder} from '../src/modules/Operations';
import {GroupContractWorkbench,applicableGroup,splitGroupAmount} from '../src/modules/Groups';
const KEY='hongchuang.health.demo.v1';
const data=():DemoState=>JSON.parse(localStorage.getItem(KEY)!);
function seed(change?:(s:DemoState)=>void){const s=createInitialState();change?.(s);localStorage.setItem(KEY,JSON.stringify(s));return s;}
const click=(name:string|RegExp)=>fireEvent.click(screen.getByRole('button',{name}));
const set=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
const renderNode=(node:React.ReactNode)=>render(<DemoProvider>{node}</DemoProvider>);
async function app(route:string){window.location.hash='#'+route;renderNode(<App/>);await waitFor(()=>expect(screen.queryByText(/正在加载/)).toBeNull());}
function group(overrides:Record<string,unknown>={}){return {id:'GO-QA',name:'QA单位预算',company:'星辰科技',status:'生效',startDate:'2026-10-01',endDate:'2026-12-31',mode:'限额自选',budget:300,packages:['PK01','PK02'],members:['P001','P003'],personalItems:[],optionalItems:[],choose:0,...overrides};}
beforeEach(()=>{cleanup();localStorage.clear();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));});
afterEach(()=>{cleanup();vi.useRealTimers();});

describe('Independent v2: scopes and repeat-activation regressions',()=>{
 it('does not expose or let a scoped role handle another patient’s global alert',async()=>{
  seed(s=>{s.config.customRoleId='QA';s.records.roles=[{id:'QA',name:'仅P001',menuPaths:['/health'],allowedPatientIds:['P001']}];s.records.alerts=[{id:'OUTSIDE',patientId:'P002',title:'仅P002可见合成异常',value:'9.8',status:'待处理'}];});
  await app('/health');expect(screen.queryByText('仅P002可见合成异常')).toBeNull();expect(screen.queryByRole('dialog',{name:'重大异常全局提醒 · 模拟'})).toBeNull();
 });
 it('filters patient-linked medical records, not just the patient selector',async()=>{
  seed(s=>{s.config.customRoleId='QA';s.records.roles=[{id:'QA',name:'仅P001',menuPaths:['/health'],allowedPatientIds:['P001']}];s.records.medicalRecords=[{id:'OUTSIDE',patientId:'P002',patient:'苏清禾',name:'仅P002可见合成病历',category:'个人病历',owner:'合成医生',date:'2026-10-13',description:'QA范围外演示记录',status:'已复核'}];});
  await app('/health');click('病历与处方');expect(screen.queryByText('仅P002可见合成病历')).toBeNull();
 });
 it('creates only one plan/task set when one template confirmation is activated twice',()=>{
  seed(s=>{s.tasks=[];s.records.healthPlans=[];});renderNode(<Health/>);click('健康计划');fireEvent.click(screen.getByLabelText('已确认模板及词条适合本次合成演示'));
  const button=screen.getByRole('button',{name:'应用模板并生成计划任务'});act(()=>{fireEvent.click(button);fireEvent.click(button);});
  expect(data().records.healthPlans.filter(p=>p.templateId)).toHaveLength(1);
 });
 it('does not create two orders or over-allocate one-stock product from one repeated confirmation',()=>{
  seed(s=>{s.records.products=[{id:'P-QA',name:'QA单库存商品',price:50,weight:1,stock:1,status:'在售',category:'日用',description:'仅演示'}];s.records.shopOrders=[];});renderNode(<Operations section="commerce"/>);click('交易与预约模拟');click('预览并确认交易');
  const button=screen.getByRole('button',{name:'确认创建本地交易'});act(()=>{fireEvent.click(button);fireEvent.click(button);});
  expect(data().records.shopOrders).toHaveLength(1);
 });
});

describe('Independent v2: unit budget and personnel consumers',()=>{
 it('H5 consumes the active unit contract and subgroup package, not the old fixed 800 budget',async()=>{
  seed(s=>{s.appointments=[];s.records.groupOrders=[group()];s.records.groupPersonnelGroups=[{id:'SUB-QA',groupOrderId:'GO-QA',name:'QA基础组',packageId:'PK01',members:['P001']}];});await app('/patient?group=xingchen-2026');
  expect(screen.getByText('基础安心体检',{selector:'b'})).toBeTruthy();expect(screen.queryByText('都市精英体检',{selector:'b'})).toBeNull();
  fireEvent.click(screen.getByRole('checkbox',{name:/已阅读预约须知/}));click('确认预约');
  expect(data().appointments).toHaveLength(1);expect(data().appointments[0]).toMatchObject({packageId:'PK01',groupOrderId:'GO-QA',amount:399,selfPay:99,groupSplit:{unit:300,personal:99}});
  click('模拟支付');expect(screen.getByRole('dialog',{name:'模拟支付'}).textContent).toContain('99');click('关闭支付');expect(data().appointments[0].status).toBe('booked');
 });
 it('backend consumes the same subgroup package and unit split',async()=>{
  seed(s=>{s.appointments=[];s.records.groupOrders=[group()];s.records.groupPersonnelGroups=[{id:'SUB-QA',groupOrderId:'GO-QA',name:'QA基础组',packageId:'PK01',members:['P001']}];});await app('/appointments');click('新建预约');
  set('体检人','P003');set('体检人','P001');click('确认预约');
  expect(data().appointments).toHaveLength(1);expect(data().appointments[0]).toMatchObject({packageId:'PK01',groupPersonnelId:'SUB-QA',groupPersonnelName:'QA基础组',groupSplit:{unit:300,personal:99}});
 });
 it('H5 blocks an excluded unit member instead of granting fallback budget',async()=>{
  seed(s=>{s.appointments=[];s.records.groupOrders=[group({members:['P003']})];});await app('/patient?group=xingchen-2026');
  fireEvent.click(screen.getByRole('checkbox',{name:/已阅读预约须知/}));const button=screen.getByRole('button',{name:'确认预约'});fireEvent.click(button);expect(data().appointments).toHaveLength(0);
 });
 it('personnel group membership cannot overlap and an exact save remains one group',()=>{
  seed(s=>{s.records.groupOrders=[group()];});renderNode(<GroupContractWorkbench/>);click(/星辰科技 · QA单位预算/);
  set('人员分组名称','一组');set('分组套餐','PK01');fireEvent.click(screen.getByRole('checkbox',{name:'林知远加入分组'}));click('保存人员分组');click('保存人员分组');expect(data().records.groupPersonnelGroups).toHaveLength(1);
  set('人员分组名称','二组');click('保存人员分组');expect(data().records.groupPersonnelGroups).toHaveLength(1);expect(screen.getByRole('status').textContent).toContain('已属于其他组');
 });
 it('unit allocation stays within line total for personal-only and unlimited budgets',()=>{
  const rows=[{item:'一般检查',amount:80.25},{item:'肺功能',amount:19.75}];
  expect(splitGroupAmount(group({mode:'无限额',personalItems:['肺功能']}),rows)).toEqual({unit:80.25,personal:19.75});
  expect(splitGroupAmount(group({budget:0}),rows)).toEqual({unit:0,personal:100});
  const s=createInitialState();s.records.groupOrders=[group({endDate:'2026-10-12'})];expect(applicableGroup(s,'P001','2026-10-13')).toBeUndefined();
 });
});

describe('Independent v2: rule boundaries, cancellation and money',()=>{
 it('hides inapplicable and disabled-online packages in H5',async()=>{
  seed(s=>{s.records.packageRules=[{id:'F',packageId:'PK01',sex:'女'},{id:'D',packageId:'PK02',onlineEnabled:false}];});await app('/patient');click('开启健康计划');
  expect(screen.queryByText('基础安心体检',{selector:'b'})).toBeNull();expect(screen.queryByText('都市精英体检',{selector:'b'})).toBeNull();
 });
 it('template termination requires a reason and cancels its tasks without deleting the snapshot',()=>{
  seed(s=>{s.tasks=[];s.records.healthPlans=[];});renderNode(<Health/>);click('健康计划');fireEvent.click(screen.getByLabelText('已确认模板及词条适合本次合成演示'));click('应用模板并生成计划任务');
  const plan=data().records.healthPlans.find(p=>p.templateId);click('终止关联计划');expect(data().records.healthPlans[0].status).toBe('进行中');set('计划终止原因','QA合成计划取消');click('终止关联计划');
  expect(data().records.healthPlans[0].templateSnapshot).toEqual(plan.templateSnapshot);expect(data().tasks.filter(t=>t.planId===plan.id).every(t=>t.status==='已取消')).toBe(true);
 });
 it('cancelled redemption confirmation leaves points unchanged and successful cancellation refunds once',()=>{
  seed();renderNode(<Operations section="content"/>);click('健康广场与活动');
  const row=screen.getByText('健康主题帆布袋（合成）').closest('.health-attention-row')!;fireEvent.click(within(row).getByRole('button',{name:'兑换商品'}));fireEvent.click(within(screen.getByRole('dialog',{name:'确认梦想商品兑换'})).getByRole('button',{name:'取消'}));expect(data().records.loyaltyAccounts||[]).toHaveLength(0);
  fireEvent.click(within(row).getByRole('button',{name:'兑换商品'}));click('确认兑换（模拟）');expect(data().records.loyaltyAccounts[0].balance).toBe(20);click('取消并退豆');expect(data().records.loyaltyAccounts[0].balance).toBe(100);expect(data().records.loyaltyAccounts[0].ledger.filter((x:any)=>x.delta===80)).toHaveLength(1);
 });
 it('commerce confirmation cancellation does not reserve stock; fractional quantity is rejected',()=>{
  seed(s=>{s.records.shopOrders=[];});renderNode(<Operations section="commerce"/>);click('交易与预约模拟');click('预览并确认交易');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'返回修改'}));expect(data().records.shopOrders).toHaveLength(0);set('购买数量','1.5');click('预览并确认交易');expect(data().records.shopOrders).toHaveLength(0);expect(screen.getByText(/数量必须为正整数/)).toBeTruthy();
 });
 it('weight increments and free-shipping are computed after discount and unsupported regions fail',()=>{
  const product={price:100,weight:1.01};const ship={region:'青岛市',baseFee:8,firstWeight:1,additionalWeight:0.5,additionalFee:3,freeAbove:100};
  expect(quoteCommerceOrder(product,1,ship,{discount:9,minPeople:2},'配送','青岛市')).toMatchObject({shipping:11,total:101});
  expect(quoteCommerceOrder(product,1,ship,null,'配送','青岛市')).toMatchObject({shipping:0,total:100});
  expect(quoteCommerceOrder(product,1,ship,null,'配送','上海市').errors.length).toBeGreaterThan(0);
 });
});

describe('Independent v2: additional scope and cancellation edges',()=>{
 it('one repeated group-generation confirmation creates one open task per member',()=>{
  seed(s=>{s.tasks=[];});renderNode(<Health/>);click('人群分组');set('分组单位条件','星辰科技');set('分组风险条件','B类');
  const button=screen.getByRole('button',{name:'保存分组并生成干预任务'});act(()=>{fireEvent.click(button);fireEvent.click(button);});
  const groups=data().records.healthGroups.filter(g=>g.rule);expect(groups).toHaveLength(1);expect(groups[0].memberIds).toEqual(['P001']);expect(data().tasks.filter(t=>t.groupId===groups[0].id)).toHaveLength(1);
 });
 it('scoped workload logs do not reveal another patient’s structured before/after snapshot',async()=>{
  seed(s=>{s.config.customRoleId='QA';s.records.roles=[{id:'QA',name:'仅P001',menuPaths:['/analytics'],allowedPatientIds:['P001']}];s.audit=[{id:'SECRET',time:'2026-10-13T08:00:00Z',actor:'demo',action:'SAVE_RESULTS',entity:s.appointments[1].id,message:'QA范围外P002检查详情',before:s.appointments[1],after:s.appointments[1]}];});await app('/analytics');expect(screen.queryByText('QA范围外P002检查详情')).toBeNull();
 });
 it('cancelling a created trade frees its stock for the next customer',()=>{
  seed(s=>{s.records.products=[{id:'P-QA',name:'QA单库存商品',price:50,weight:1,stock:1,status:'在售',category:'日用',description:'仅演示'}];s.records.shopOrders=[];});renderNode(<Operations section="commerce"/>);click('交易与预约模拟');click('预览并确认交易');click('确认创建本地交易');click('取消订单');
  expect(data().records.shopOrders[0].status).toBe('已取消');set('交易客户','P002');click('预览并确认交易');click('确认创建本地交易');expect(data().records.shopOrders.filter(o=>o.status!=='已取消')).toHaveLength(1);
 });
});

describe('Independent v2: configured zero price and scoped inventory invariants',()=>{
 it('honours a configured zero-priced group add-on in the actual H5 appointment charge',async()=>{
  seed(s=>{s.appointments=[];s.records.groupOrders=[group({packages:['PK01'],optionalItems:['QA免费加项'],choose:1})];s.records.orderingRules=[{id:'FREE',item:'QA免费加项',price:0,enabled:true}];});await app('/patient?group=xingchen-2026');
  fireEvent.click(screen.getByRole('checkbox',{name:/QA免费加项/}));fireEvent.click(screen.getByRole('checkbox',{name:/已阅读预约须知/}));click('确认预约');
  expect(data().appointments).toHaveLength(1);expect(data().appointments[0].amount).toBe(399);expect(data().appointments[0].pricing.find((r:any)=>r.item==='QA免费加项').amount).toBe(0);
 });
 it('a patient-scoped commerce view still respects stock already reserved by hidden customers',async()=>{
  seed(s=>{s.config.customRoleId='QA';s.records.roles=[{id:'QA',name:'仅P001商城',menuPaths:['/commerce'],allowedPatientIds:['P001']}];s.records.products=[{id:'P-QA',name:'QA单库存商品',price:50,weight:1,stock:1,status:'在售',category:'日用',description:'仅演示'}];s.records.shopOrders=[{id:'HIDDEN',customerId:'P002',productId:'P-QA',name:'QA单库存商品',quantity:1,amount:58,status:'待付款'}];});await app('/commerce');click('交易与预约模拟');click('预览并确认交易');
  const confirm=screen.queryByRole('button',{name:'确认创建本地交易'});if(confirm)fireEvent.click(confirm);
  expect(data().records.shopOrders.filter(o=>!['已取消','已退款'].includes(o.status))).toHaveLength(1);
 });
});

describe('Independent v2: initial personnel-package selection',()=>{
 it('opening an order for the already-selected customer immediately brings in the subgroup package',async()=>{
  seed(s=>{s.appointments=[];s.records.groupOrders=[group()];s.records.groupPersonnelGroups=[{id:'SUB-QA',groupOrderId:'GO-QA',name:'QA基础组',packageId:'PK01',members:['P001']}];});await app('/appointments');click('新建预约');
  expect((screen.getByLabelText('体检套餐') as HTMLSelectElement).value).toBe('PK01');click('确认预约');expect(data().appointments[0].packageId).toBe('PK01');
 });
});
