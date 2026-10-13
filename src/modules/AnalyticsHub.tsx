import { useState } from "react";
import type { ReactNode } from "react";
import ProjectStatistics from "./ProjectStatistics";
import AppointmentDashboard from "./AppointmentDashboard";
import { BusinessAnalytics } from "./BusinessAnalytics";
import { QualityAnalytics } from "./QualityAnalytics";
import { ReportBuilder } from "./ReportBuilder";
import InvoiceAging from "./InvoiceAging";
export function AnalyticsHub({ audit }: { audit: ReactNode }) {
  const [tab, setTab] = useState("操作审计");
  const tabs = [
    "操作审计",
    "精细项目统计",
    "预约排期",
    "业务与财务",
    "质控主任看板",
    "发票账龄",
    "自定义报表",
  ];
  return (
    <div>
      <div
        className="tabs"
        role="tablist"
        aria-label="统计分析工作台"
        style={{ flexWrap: "wrap", marginBottom: 20 }}
      >
        {tabs.map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "操作审计" ? (
        audit
      ) : tab === "精细项目统计" ? (
        <ProjectStatistics />
      ) : tab === "预约排期" ? (
        <AppointmentDashboard />
      ) : tab === "业务与财务" ? (
        <BusinessAnalytics />
      ) : tab === "质控主任看板" ? (
        <QualityAnalytics />
      ) : tab === "发票账龄" ? (
        <InvoiceAging />
      ) : (
        <ReportBuilder />
      )}
    </div>
  );
}
