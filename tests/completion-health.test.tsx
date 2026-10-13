// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  act,
  cleanup,
} from "@testing-library/react";
import { DemoProvider, createInitialState, useDemo } from "../src/store";
import {
  LocalMessages,
  FamilyRelations,
  CompanyHierarchy,
  DoctorTeamRelations,
  OutcomeTimeline,
} from "../src/modules/HealthDomains";
import {
  OrganizationWorkspace,
  DictionaryCategories,
  DeviceInventory,
  deviceBalance,
  dictionaryDomains,
} from "../src/modules/AdminDomains";
import {
  ServiceBatch,
  AccountsFinance,
  walletBalance,
  postWalletEntry,
  sourceFinanceRows,
} from "../src/modules/ServiceFinance";
import {
  ProductAttributes,
  ExchangeWorkbench,
  OrderDisputes,
} from "../src/modules/CommerceAftercare";
import { CrmProgress, crmOrderProgress } from "../src/modules/CrmProgress";
import {
  UiResourceSettings,
  resolveMenuPresentation,
  uiElementAllowed,
} from "../src/modules/UiResources";
import { followupWorkload } from "../src/modules/FollowupAllocation";
import Health from "../src/modules/Health";
import Operations from "../src/modules/Operations";
import type { DemoState } from "../src/model";
const KEY = "hongchuang.health.demo.v1";
function Probe() {
  const { state } = useDemo();
  return <pre data-testid="state">{JSON.stringify(state)}</pre>;
}
const data = () => JSON.parse(screen.getByTestId("state").textContent!);
function mount(node: React.ReactNode, patch?: (s: DemoState) => void) {
  const s = createInitialState();
  patch?.(s);
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(
    <DemoProvider>
      {node}
      <Probe />
    </DemoProvider>,
  );
}
const set = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const tick = (name: string) => fireEvent.click(screen.getByLabelText(name));
function tradeSeed(s: DemoState) {
  s.records.products = [
    { id: "PROD1", name: "原合成商品", stock: 2, price: 20, status: "在售" },
    { id: "PROD2", name: "替换合成商品", stock: 2, price: 20, status: "在售" },
  ];
  s.records.shopOrders = [
    {
      id: "SO1",
      name: "已签收商品",
      customerId: "P001",
      productId: "PROD1",
      quantity: 1,
      amount: 20,
      date: "2026-10-13",
      status: "已签收",
    },
    {
      id: "OTHER",
      name: "其他订单",
      customerId: "P002",
      productId: "PROD2",
      quantity: 1,
      amount: 20,
      date: "2026-10-13",
      status: "待付款",
    },
  ];
  s.records.serviceOrders = [
    {
      id: "SV1",
      name: "报告服务",
      customerId: "P001",
      amount: 30,
      status: "已完成",
      date: "2026-10-13",
    },
  ];
}
describe("Health completion: ID relations and actual local messages", () => {
  it.each(["短信", "邮件"])(
    "sends %s only after explicit preview, once, and separates sent history from drafts",
    (channel) => {
      mount(<LocalMessages patientId="P001" />);
      set("消息渠道", channel);
      set("本地消息正文", "合成服务说明");
      click("保存消息草稿");
      expect(data().records.localMessages[0].status).toBe("草稿");
      click("预览本地发送");
      let modal = screen.getByRole("dialog");
      expect(modal.textContent).toContain("林知远");
      click("取消发送");
      expect(data().records.localMessages).toHaveLength(1);
      click("预览本地发送");
      modal = screen.getByRole("dialog");
      const confirm = within(modal).getByRole("button", {
        name: "确认模拟发送",
      });
      act(() => {
        fireEvent.click(confirm);
        fireEvent.click(confirm);
      });
      expect(
        data().records.localMessages.filter(
          (m: any) => m.status === "已模拟发送",
        ),
      ).toHaveLength(1);
      expect(data().records.controlNotifications).toHaveLength(1);
      const saved = data();
      cleanup();
      localStorage.setItem(KEY, JSON.stringify(saved));
      render(
        <DemoProvider>
          <LocalMessages sentOnly />
          <Probe />
        </DemoProvider>,
      );
      set("消息渠道", channel);
      const table = screen.getByRole("table", { name: "本地消息日志" });
      expect(table.querySelectorAll("tbody tr")).toHaveLength(1);
      expect(table.textContent).not.toContain("草稿");
      set("消息接收客户", "P002");
      expect(table.querySelectorAll("tbody tr")).toHaveLength(0);
    },
  );
  it("links real patient IDs into a family, opens a member and removes only the relationship", () => {
    const open = vi.fn();
    mount(<FamilyRelations patientId="P001" onOpenPatient={open} />);
    set("家庭账户名称", "合成家庭");
    tick("家庭成员 P002");
    click("保存家庭成员关系");
    const f = data().records.families[0];
    expect(f.memberIds).toEqual(["P001", "P002"]);
    click("查看成员档案 P002");
    expect(open).toHaveBeenCalledWith("P002");
    click("移除家庭成员 P002");
    expect(data().records.families[0].memberIds).toEqual(["P001"]);
    expect(data().patients).toHaveLength(8);
  });
  it("preserves child IDs on company rename and rejects cycles", () => {
    mount(<CompanyHierarchy />, (s) => {
      s.records.companyUnits = [];
    });
    set("层级单位名称", "父单位");
    click("保存单位层级");
    const parent = data().records.companyUnits[0].id;
    set("维护单位", "");
    set("层级单位名称", "子单位");
    set("上级单位ID", parent);
    click("保存单位层级");
    const child = data().records.companyUnits.find(
      (u: any) => u.name === "子单位",
    ).id;
    set("维护单位", parent);
    set("层级单位名称", "父单位更名");
    click("保存单位层级");
    expect(
      data().records.companyUnits.find((u: any) => u.id === child).parentId,
    ).toBe(parent);
    set("上级单位ID", child);
    click("保存单位层级");
    expect(
      data().records.companyUnits.find((u: any) => u.id === parent).parentId,
    ).toBe("");
    expect(screen.getByRole("status").textContent).toContain("自身或子孙");
  });
  it("isolates created teams by account and preserves linked members and activities on rename", () => {
    mount(<DoctorTeamRelations />, (s) => {
      s.records.staff = [
        { id: "D1", name: "医生一", status: "已通过" },
        { id: "D2", name: "医生二", status: "已通过" },
      ];
      s.records.doctorTeams = [];
    });
    set("团队创建账户", "D1");
    set("团队关系名称", "甲团队");
    tick("团队成员 D1");
    tick("团队成员 D2");
    click("保存我的团队");
    const team = data().records.doctorTeams[0];
    set("团队活动名称", "团队知识活动");
    click("创建团队活动");
    expect(data().records.communityActivities[0].teamId).toBe(team.id);
    set("团队关系名称", "甲团队新名");
    click("保存我的团队");
    expect(data().records.doctorTeams[0].id).toBe(team.id);
    expect(data().records.communityActivities[0].teamId).toBe(team.id);
    click("移除团队成员 D2");
    expect(data().records.doctorTeams[0].memberIds).toEqual(["D1"]);
    set("团队创建账户", "D2");
    expect(screen.queryByRole("option", { name: "甲团队新名" })).toBeNull();
    expect(data().records.staff).toHaveLength(2);
  });
  it("compares real baseline and distinct 30/60 day observations while preserving missing and future nodes", () => {
    mount(<OutcomeTimeline />, (s) => {
      s.config.healthOutcomeDate = "2026-11-30";
      s.records.healthPlans = [
        {
          id: "PLAN",
          name: "指标观察计划",
          patientId: "P001",
          date: "2026-09-01",
          description: "合成计划",
        },
      ];
      s.tasks = [
        {
          id: "T30",
          planId: "PLAN",
          patientId: "P001",
          title: "30天任务",
          date: "2026-10-01",
          period: "30 天",
          status: "已完成",
        },
        {
          id: "T60",
          planId: "PLAN",
          patientId: "P001",
          title: "60天任务",
          date: "2026-10-31",
          period: "60 天",
          status: "待处理",
        },
      ];
    });
    set("合成观察值", "120");
    click("保存节点观察");
    set("录入观察节点", "30");
    set("合成观察值", "130");
    set("合成观察目标", "125");
    click("保存节点观察");
    expect(screen.getByTestId("outcome-values").textContent).toContain("10.00");
    expect(screen.getByRole("table").textContent).toContain("30天任务");
    set("录入观察节点", "60");
    set("合成观察值", "110");
    click("保存节点观察");
    set("干预效果节点", "60");
    expect(screen.getByTestId("outcome-values").textContent).toContain(
      "-10.00",
    );
    expect(screen.getByRole("table").textContent).toContain("待处理");
    set("干预效果节点", "90");
    expect(screen.getByTestId("outcome-values").textContent).toContain(
      "缺少前后数据",
    );
    set("录入观察节点", "365");
    click("保存节点观察");
    expect(data().records.healthOutcomeObservations).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toContain("未到节点");
  });
  it("applies two structured assessment packages to different metric inputs and saved report sections", () => {
    mount(<Health />);
    click("风险评估");
    set("评估类型", "设备慢病评估套餐");
    set("评估指标套餐名称", "血压资料套餐");
    click("保存并应用指标套餐");
    const a = data().records.clinicalConfig[0];
    expect(a.metricKeys).toEqual(["systolic", "diastolic"]);
    set("评估指标套餐名称", "收缩压与血糖套餐");
    tick("套餐指标 diastolic");
    tick("套餐指标 fastingGlucose");
    tick("套餐章节 问卷答案");
    click("保存并应用指标套餐");
    expect(screen.queryByRole("spinbutton", { name: /舒张压/ })).toBeNull();
    click("生成教育性流程报告");
    expect(
      screen.getByTestId("assessment-template-preview").textContent,
    ).toContain("本套餐未包含问卷答案章节");
    click("保存报告，等待专业复核");
    const report = data().records.assessments[0];
    expect(Object.keys(report.metricSnapshot)).toEqual([
      "systolic",
      "fastingGlucose",
    ]);
    expect(report.assessmentPackageSnapshot.sections).not.toContain("问卷答案");
    set("套用评估指标套餐", a.id);
    expect(screen.getByRole("spinbutton", { name: /舒张压/ })).toBeTruthy();
    expect(data().records.assessments[0].assessmentPackageSnapshot.name).toBe(
      "收缩压与血糖套餐",
    );
  });
});

describe("Health completion: source finance, batch editing and aftercare", () => {
  it("validates a whole service batch before updating selected material fields", () => {
    mount(<ServiceBatch />, (s) => {
      s.records.serviceCatalog = [
        { id: "S1", name: "一", price: 10, owner: "甲" },
        { id: "S2", name: "二", price: 20, owner: "乙" },
        { id: "S3", name: "三", price: 30, owner: "丙" },
      ];
    });
    tick("批改服务 S1");
    tick("批改服务 S2");
    set("服务批改字段", "price");
    set("服务批改值", "-1");
    click("确认批改服务字段");
    expect(data().records.serviceCatalog.map((r: any) => r.price)).toEqual([
      10, 20, 30,
    ]);
    set("服务批改值", "12.50");
    click("确认批改服务字段");
    expect(data().records.serviceCatalog.map((r: any) => r.price)).toEqual([
      12.5, 12.5, 30,
    ]);
  });
  it("derives wallet balance from confirmed entries, supports cancellation/reversal and deduplicates submissions", () => {
    let view = mount(<AccountsFinance />);
    set("模拟充值金额", "100");
    click("预览模拟充值");
    let confirm = screen.getByRole("button", { name: "确认本地充值" });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(walletBalance(data().records.accountLedgers[0])).toBe(100);
    set("模拟充值金额", "50");
    click("预览模拟充值");
    click("取消本次充值");
    expect(walletBalance(data().records.accountLedgers[0])).toBe(100);
    set("模拟充值金额", "60");
    click("预览模拟充值");
    click("确认本地充值");
    const first = data().records.accountLedgers[0].entries[0];
    click(`撤销充值 ${first.id}`);
    expect(walletBalance(data().records.accountLedgers[0])).toBe(60);
    expect(data().records.accountLedgers[0].entries).toHaveLength(3);
    view.unmount();
    view = render(
      <DemoProvider>
        <AccountsFinance />
        <Probe />
      </DemoProvider>,
    );
    expect(screen.getByTestId("wallet-balance").textContent).toContain("60.00");
    view.unmount();
  });
  it("pays and refunds source service orders with conserved ledger amounts and traceable report settlement", () => {
    mount(<AccountsFinance />, (s) => {
      s.records.serviceCatalog = [
        {
          id: "S1",
          name: "报告解读",
          price: 30,
          owner: "甲",
          status: "已通过",
        },
      ];
      s.records.assessments = [
        { id: "REPORT", patientId: "P001", name: "合成评估报告" },
      ];
    });
    set("模拟充值金额", "100");
    click("预览模拟充值");
    click("确认本地充值");
    set("付费服务项目", "S1");
    set("服务关联评估报告", "REPORT");
    const create = screen.getByRole("button", { name: "创建待付款服务订单" });
    act(() => {
      fireEvent.click(create);
      fireEvent.click(create);
    });
    expect(data().records.serviceOrders).toHaveLength(1);
    const order = data().records.serviceOrders[0];
    expect(order.status).toBe("待付款");
    click(`余额支付 ${order.id}`);
    expect(walletBalance(data().records.accountLedgers[0])).toBe(70);
    expect(data().records.serviceOrders[0].status).toBe("待处理");
    click(`申请本地退款 ${order.id}`);
    set("财务订单筛选", "退款");
    expect(
      screen.getByRole("table", { name: "源订单财务清单" }).textContent,
    ).toContain("退款申请");
    click(`确认原路本地退款 ${order.id}`);
    expect(walletBalance(data().records.accountLedgers[0])).toBe(100);
    click("生成平台月度结算");
    expect(data().records.platformSettlements[0]).toMatchObject({
      gross: 30,
      refunds: 30,
      net: 0,
    });
    expect(data().records.platformSettlements[0].sourceOrders[0]).toMatchObject(
      { id: order.id, reportSource: "REPORT" },
    );
    expect(
      data().records.platformSettlements[0].sourceOrders[0].transactionIds,
    ).toHaveLength(2);
  });
  it("does not fabricate refunds or lose earlier debits in a batched pair of distinct payments", () => {
    mount(<AccountsFinance />, (s) => {
      s.records.accountLedgers = [
        {
          id: "WALLET-P001",
          patientId: "P001",
          entries: [
            {
              id: "OPEN",
              sourceKey: "OPEN",
              kind: "充值",
              delta: 50,
              date: "2026-10-13",
            },
          ],
        },
      ];
      s.records.serviceOrders = [
        {
          id: "A",
          name: "A",
          customerId: "P001",
          amount: 30,
          status: "待付款",
          date: "2026-10-13",
        },
        {
          id: "B",
          name: "B",
          customerId: "P001",
          amount: 30,
          status: "待付款",
          date: "2026-10-13",
        },
        {
          id: "LEGACY",
          name: "无来源",
          customerId: "P001",
          amount: 100,
          status: "退款申请",
          date: "2026-10-13",
        },
      ];
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "余额支付 A" }));
      fireEvent.click(screen.getByRole("button", { name: "余额支付 B" }));
    });
    expect(walletBalance(data().records.accountLedgers[0])).toBe(20);
    expect(
      data().records.serviceOrders.find((o: any) => o.id === "B").status,
    ).toBe("待付款");
    click("确认原路本地退款 LEGACY");
    expect(walletBalance(data().records.accountLedgers[0])).toBe(20);
    expect(
      postWalletEntry(
        { entries: [{ sourceKey: "X", delta: 1 }] },
        { sourceKey: "X", delta: 1 },
      ).entries,
    ).toHaveLength(1);
    const s = createInitialState();
    s.records.serviceOrders = [
      { id: "OLD", date: "2026-09-01", status: "已完成" },
    ];
    s.records.accountLedgers = [
      {
        entries: [
          {
            id: "TX",
            orderId: "OLD",
            collection: "serviceOrders",
            kind: "订单支付",
            delta: -20,
            date: "2026-10-01",
          },
        ],
      },
    ];
    expect(sourceFinanceRows(s, "2026-10")[0].receipts).toBe(20);
  });
  it("completes exchange reservation, return and reship without creating refunds or negative inventory", () => {
    mount(<ExchangeWorkbench />, tradeSeed);
    set("换货源订单", "SO1");
    set("换货替换商品", "PROD2");
    set("换货申请原因", "合成尺寸更换");
    click("提交换货申请");
    const exchange = data().records.orderExchanges[0];
    click(`审核换货 ${exchange.id}`);
    expect(
      data().records.shopOrders.find((o: any) => o.exchangeReservation).status,
    ).toBe("换货预留");
    click(`确认退回入库 ${exchange.id}`);
    expect(
      data().records.products.find((p: any) => p.id === "PROD1").stock,
    ).toBe(3);
    click(`确认模拟重发 ${exchange.id}`);
    expect(data().records.orderExchanges[0].status).toBe("已完成");
    expect(
      data().records.shopOrders.find((o: any) => o.id === "SO1").status,
    ).toBe("已签收");
    expect(
      data().records.shopOrders.find((o: any) => o.exchangeReservation),
    ).toMatchObject({ amount: 0, status: "已签收" });
    expect(data().records.accountLedgers).toBeUndefined();
    expect(
      data().records.products.find((p: any) => p.id === "PROD2").stock -
        data().records.resourceUsage.find((r: any) => r.resourceId === "PROD2")
          .used,
    ).toBe(0);
  });
  it("cancels an approved exchange by releasing its reservation and permits a new application", () => {
    mount(<ExchangeWorkbench />, tradeSeed);
    set("换货源订单", "SO1");
    set("换货替换商品", "PROD2");
    set("换货申请原因", "合成取消");
    click("提交换货申请");
    let ex = data().records.orderExchanges[0];
    click(`审核换货 ${ex.id}`);
    click(`取消换货 ${ex.id}`);
    expect(
      data().records.shopOrders.find((o: any) => o.exchangeReservation).status,
    ).toBe("已取消");
    expect(
      data().records.resourceUsage.find((r: any) => r.resourceId === "PROD2")
        .used,
    ).toBe(1);
    click("提交换货申请");
    ex = data().records.orderExchanges.find((x: any) => x.status === "待审核");
    click(`审核换货 ${ex.id}`);
    expect(
      data().records.orderExchanges.find((x: any) => x.id === ex.id).status,
    ).toBe("待退回");
  });
  it("protects global replacement capacity when two different exchange approvals are batched", () => {
    mount(<ExchangeWorkbench />, (s) => {
      tradeSeed(s);
      s.records.orderExchanges = [
        {
          id: "EX1",
          orderId: "SO1",
          replacementProductId: "PROD2",
          quantity: 1,
          status: "待审核",
        },
        {
          id: "EX2",
          orderId: "SO1",
          replacementProductId: "PROD2",
          quantity: 1,
          status: "待审核",
        },
      ];
    });
    const a = screen.getByRole("button", { name: "审核换货 EX1" });
    const b = screen.getByRole("button", { name: "审核换货 EX2" });
    act(() => {
      fireEvent.click(a);
      fireEvent.click(b);
    });
    expect(
      data().records.orderExchanges.filter((x: any) => x.status === "待退回"),
    ).toHaveLength(1);
    expect(
      data().records.shopOrders.filter((x: any) => x.exchangeReservation),
    ).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("库存不足");
  });
  it("cancels only unpaid source orders and guards a batched pay versus cancel", () => {
    mount(<AccountsFinance />, (s) => {
      tradeSeed(s);
      s.records.serviceOrders[0].status = "待付款";
      s.records.shopOrders[1].customerId = "P001";
      s.records.accountLedgers = [
        {
          id: "WALLET-P001",
          patientId: "P001",
          entries: [
            {
              id: "INIT",
              sourceKey: "init",
              delta: 100,
              kind: "本地充值",
              date: "2026-10-13",
            },
          ],
        },
      ];
    });
    set("交易结算月份", "2026-10");
    click("取消未付订单 OTHER");
    expect(
      data().records.shopOrders.find((x: any) => x.id === "OTHER").status,
    ).toBe("已取消");
    const pay = screen.getByRole("button", { name: "余额支付 SV1" });
    const cancel = screen.getByRole("button", { name: "取消未付订单 SV1" });
    act(() => {
      fireEvent.click(pay);
      fireEvent.click(cancel);
    });
    expect(data().records.serviceOrders[0].status).toBe("待处理");
    expect(walletBalance(data().records.accountLedgers[0])).toBe(70);
  });
  it("maintains explicit product attribute keys and options displayed in product details", () => {
    mount(<ProductAttributes />, tradeSeed);
    set("商品属性键", "颜色");
    set("商品属性选项", "青色,白色");
    click("添加商品属性");
    set("商品属性键", "容量");
    set("商品属性选项", "300ml,500ml");
    click("添加商品属性");
    expect(data().records.products[0].attributeOptions).toHaveLength(2);
    expect(screen.getByLabelText("结构化商品详情").textContent).toContain(
      "300ml / 500ml",
    );
    set("商品属性键", "颜色");
    set("商品属性选项", "红");
    click("添加商品属性");
    expect(data().records.products[0].attributeOptions).toHaveLength(2);
    click("删除商品属性 容量");
    expect(data().records.products[0].attributeOptions).toHaveLength(1);
  });
  it.each(["serviceOrders", "shopOrders"])(
    "links %s intervention and resolution back to only its source order",
    (collection) => {
      mount(<OrderDisputes />, tradeSeed);
      set("介入订单类型", collection);
      const id = collection === "serviceOrders" ? "SV1" : "SO1";
      set("平台介入源订单", id);
      set("订单纠纷原因", "合成履约疑问");
      click("发起订单平台介入");
      expect(
        data().records[collection].find((o: any) => o.id === id).disputeStatus,
      ).toBe("待介入");
      click(`受理介入 ${id}`);
      click(`提交结案 ${id}`);
      expect(data().records.orderDisputes[0].status).toBe("处理中");
      set("平台介入结论", "合成资料核对后双方确认");
      click(`提交结案 ${id}`);
      expect(
        data().records[collection].find((o: any) => o.id === id)
          .disputeResolution,
      ).toBe("合成资料核对后双方确认");
      expect(
        data().records.shopOrders.find((o: any) => o.id === "OTHER")
          .disputeStatus,
      ).toBeUndefined();
    },
  );
});

describe("Health completion: organization, taxonomy, inventory, CRM and UI consumers", () => {
  it("keeps same-name doctors in their actual organization, reviews experts and maintains ID-based groups", () => {
    mount(<OrganizationWorkspace />, (s) => {
      s.records.organizations = [
        { id: "O1", name: "机构一", category: "机构" },
        { id: "O2", name: "机构二", category: "团体" },
      ];
      s.records.staff = [
        { id: "D1", name: "同名医生", organizationId: "O1", status: "已通过" },
        { id: "D2", name: "同名医生", organizationId: "O2", status: "已通过" },
      ];
    });
    set("当前管理机构", "O1");
    expect(
      screen.getByRole("table", { name: "机构人员" }).textContent,
    ).toContain("D1");
    expect(
      screen.getByRole("table", { name: "机构人员" }).textContent,
    ).not.toContain("D2");
    set("机构名称", "机构一更名");
    click("重命名当前机构");
    expect(data().records.staff[0].organizationId).toBe("O1");
    set("机构人员姓名", "合成专家");
    tick("登记为专家");
    set("专家资质说明", "合成资质材料编号");
    click("提交机构人员资料");
    set("专家审核筛选", "待审核专家");
    expect(
      screen.getByRole("table", { name: "机构人员" }).textContent,
    ).not.toContain("同名医生");
    click("驳回 合成专家");
    expect(data().records.staff.find((p: any) => p.expert).status).toBe(
      "待审核",
    );
    set("人员审核原因", "资料需补充");
    click("驳回 合成专家");
    set("专家审核筛选", "已驳回专家");
    expect(
      screen.getByRole("table", { name: "机构人员" }).textContent,
    ).toContain("资料需补充");
    click("重新提交 合成专家");
    set("专家审核筛选", "待审核专家");
    click("通过 合成专家");
    set("医生组名称", "医生一组");
    tick("医生组成员 D1");
    click("保存医生分组");
    const group = data().records.doctorGroups[0];
    expect(group).toMatchObject({ organizationId: "O1", memberIds: ["D1"] });
    click(`移除医生组成员 ${group.id} D1`);
    expect(data().records.doctorGroups[0].memberIds).toHaveLength(0);
    set("当前管理机构", "O2");
    expect(
      screen.getByRole("table", { name: "机构人员" }).textContent,
    ).not.toContain("D1");
  });
  it.each(dictionaryDomains)(
    "maintains %s category IDs through rename and blocks new entries after disabling",
    (domain) => {
      mount(<DictionaryCategories />);
      set("字典领域", domain);
      set("字典分类名称", `${domain}子分类`);
      click("创建字典分类");
      const id = data().records.dictionaryCategories[0].id;
      set("字典条目名称", "条目一");
      set("字典条目值", "V1");
      click("添加分类条目");
      set("字典条目名称", "条目二");
      set("字典条目值", "V2");
      click("添加分类条目");
      set("字典分类名称", `${domain}新分类名`);
      click("重命名分类");
      expect(
        data().records.dictionaries.every((e: any) => e.categoryId === id),
      ).toBe(true);
      expect(screen.getByRole("table").textContent).toContain(
        `${domain}新分类名`,
      );
      click("切换分类启停");
      set("字典条目名称", "条目三");
      set("字典条目值", "V3");
      click("添加分类条目");
      expect(data().records.dictionaries).toHaveLength(2);
      expect(data().records.dictionaryCategories[0].status).toBe("已停用");
    },
  );
  it("posts integer inventory movements once, rejects negative stock and preserves history", () => {
    mount(<DeviceInventory />);
    set("库存设备型号", "合成血压设备型号");
    click("新增库存型号");
    set("设备出入库数量", "2");
    set("设备出入库原因", "合成采购入库");
    const button = screen.getByRole("button", { name: "确认设备出入库" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(deviceBalance(data().records.deviceInventory[0])).toBe(2);
    set("设备出入库类型", "出库");
    set("设备出入库数量", "3");
    click("确认设备出入库");
    expect(deviceBalance(data().records.deviceInventory[0])).toBe(2);
    set("设备出入库数量", "1");
    set("设备出入库原因", "合成领用");
    click("确认设备出入库");
    expect(deviceBalance(data().records.deviceInventory[0])).toBe(1);
    set("库存设备状态", "维修");
    set("设备出入库原因", "维修期间禁止领用");
    click("确认设备出入库");
    expect(deviceBalance(data().records.deviceInventory[0])).toBe(1);
    expect(screen.getByRole("status").textContent).toContain("不可出库");
    expect(
      screen
        .getByRole("table", { name: "设备库存历史" })
        .querySelectorAll("tr"),
    ).toHaveLength(2);
  });
  it("links CRM contracts to actual orders and calculates annual personal completion and per-item progress", () => {
    mount(<CrmProgress />, (s) => {
      s.records.crmCustomers = [
        { id: "C1", name: "客户一" },
        { id: "C2", name: "客户二" },
      ];
      s.records.crmContracts = [
        { id: "CON1", name: "合同一", customerId: "C1", owner: "甲" },
        { id: "CON2", name: "合同二", customerId: "C2", owner: "乙" },
      ];
      s.appointments = s.appointments.slice(0, 3).map((a, i) => ({
        ...a,
        id: "ORDER" + i,
        date: "2026-10-13",
        items: ["检项一", "检项二"],
        results:
          i === 0
            ? { 检项一: "合成结果", 检项二: "合成结果" }
            : { 检项一: "合成结果" },
        status: i === 0 ? "approved" : "in_exam",
      }));
    });
    set("CRM体检客户", "C1");
    set("CRM关联合同", "CON1");
    set("CRM关联体检订单", "ORDER0");
    click("保存CRM订单关联");
    set("CRM关联体检订单", "ORDER1");
    click("保存CRM订单关联");
    expect(screen.getByTestId("crm-real-completion").textContent).toContain(
      "已完成 1",
    );
    expect(screen.getByTestId("crm-real-completion").textContent).toContain(
      "50%",
    );
    expect(
      screen.getByRole("table", { name: "CRM订单项目 ORDER1", hidden: true })
        .textContent,
    ).toContain("未完成");
    set("CRM体检客户", "C2");
    set("CRM关联合同", "CON2");
    set("CRM关联体检订单", "ORDER2");
    click("保存CRM订单关联");
    expect(crmOrderProgress(data(), "2026", "甲", "C1")).toHaveLength(2);
    expect(screen.queryByText(/客户一 ·/)).toBeNull();
    set("CRM体检年度", "2025");
    expect(screen.getByTestId("crm-real-completion").textContent).toContain(
      "有效订单 0",
    );
  });
  it("saves menu presentation and resource policy, then actual profile controls consume denials", () => {
    const view = mount(<UiResourceSettings />, (s) => {
      s.records.roles = [{ id: "R", name: "受限角色", elementPermissions: {} }];
    });
    set("实际UI资源", "menu:/health");
    set("资源显示名称", "合成健康菜单");
    set("资源顺序", "3");
    click("保存实际资源");
    expect(resolveMenuPresentation(data(), "/health", "健康管理")).toEqual({
      label: "合成健康菜单",
      order: 3,
      visible: true,
    });
    set("实际UI资源", "health.profile.edit");
    set("元素权限角色", "R");
    set("元素权限值", "deny");
    click("保存元素权限");
    let snapshot = data();
    expect(
      uiElementAllowed(
        { ...snapshot, config: { ...snapshot.config, customRoleId: "R" } },
        "health.profile.edit",
      ),
    ).toBe(false);
    snapshot.config.customRoleId = "R";
    snapshot.records.roles[0].elementPermissions["health.profile.phone"] =
      "deny";
    view.unmount();
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    render(
      <DemoProvider>
        <Health />
        <Probe />
      </DemoProvider>,
    );
    expect(screen.queryByRole("button", { name: "维护档案" })).toBeNull();
    expect(screen.queryByRole("button", { name: "新建客户档案" })).toBeNull();
    expect(screen.getByText(/联系标识不可见/)).toBeTruthy();
  });
  it("blocks actual service batch and commerce creation controls under element denial", () => {
    mount(<Operations section="commerce" />, (s) => {
      s.config.customRoleId = "R";
      s.records.roles = [
        {
          id: "R",
          name: "受限",
          elementPermissions: {
            "commerce.order.create": "deny",
            "operations.export": "deny",
            "services.batch.update": "deny",
          },
        },
      ];
    });
    expect(
      screen.queryByRole("button", { name: "导出", exact: true }),
    ).toBeNull();
    click("交易与预约模拟");
    expect(screen.queryByRole("button", { name: "预览并确认交易" })).toBeNull();
  });
  it("aggregates actual responsibility workload with pending, active, complete and rate", () => {
    expect(
      followupWorkload([
        { owner: "甲", status: "待处理" },
        { owner: "甲", status: "进行中" },
        { owner: "甲", status: "已完成" },
        { owner: "乙", status: "已完成" },
      ]),
    ).toEqual([
      { owner: "乙", total: 1, pending: 0, active: 0, completed: 1, rate: 100 },
      { owner: "甲", total: 3, pending: 1, active: 1, completed: 1, rate: 33 },
    ]);
  });
});
