import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ArrowUpRight, ChevronRight } from "lucide-react";
import { statusNames } from "./model";
export function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      tone={
        ["booked", "review"].includes(status)
          ? "amber"
          : status === "cancelled"
            ? "gray"
            : "green"
      }
    >
      {statusNames[status] || status}
    </Badge>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
let openModalCount = 0;
let previousBodyOverflow = "";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    if (openModalCount++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (--openModalCount === 0)
        document.body.style.overflow = previousBodyOverflow;
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
export function Metric({
  label,
  value,
  unit,
  note,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        {children}
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="metric-note">
        <ArrowUpRight size={14} />
        {note || "合成样例 · 实时本地数据"}
      </div>
    </div>
  );
}
export function Empty({ text = "暂无符合条件的记录" }: { text?: string }) {
  return (
    <div className="empty">
      <div>◌</div>
      <h3>{text}</h3>
      <p>试试调整筛选条件，或创建一条演示记录</p>
    </div>
  );
}
export function LinkButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="link-btn" href={"#" + href}>
      {children}
      <ChevronRight size={15} />
    </a>
  );
}
export function Bars({
  values,
  labels,
}: {
  values: number[];
  labels: string[];
}) {
  return (
    <div className="bar-chart">
      {values.map((v, i) => (
        <div className="bar-col" key={i}>
          <span>{v}</span>
          <div
            style={{
              height: `${Math.max(6, (v / Math.max(...values)) * 120)}px`,
            }}
          />
          <small>{labels[i]}</small>
        </div>
      ))}
    </div>
  );
}
export function Trend() {
  return (
    <div className="trend">
      <div className="chart-y">
        <span>120</span>
        <span>90</span>
        <span>60</span>
        <span>30</span>
        <span>0</span>
      </div>
      <svg
        viewBox="0 0 690 180"
        preserveAspectRatio="none"
        role="img"
        aria-label="最近七日预约与到检合成趋势"
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#2c9a89" stopOpacity=".18" />
            <stop offset="1" stopColor="#2c9a89" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[10, 50, 90, 130, 170].map((y) => (
          <path
            key={y}
            d={`M0 ${y}H690`}
            stroke="#e7edeb"
            strokeDasharray="3 5"
          />
        ))}
        <path
          d="M0 130 C50 140 60 90 115 91 S200 150 230 115 S300 85 345 97 S420 38 460 54 S535 89 575 58 S635 26 690 35 V180 H0Z"
          fill="url(#area)"
        />
        <path
          d="M0 130 C50 140 60 90 115 91 S200 150 230 115 S300 85 345 97 S420 38 460 54 S535 89 575 58 S635 26 690 35"
          fill="none"
          stroke="#208576"
          strokeWidth="3"
        />
        <path
          d="M0 156 C50 160 60 124 115 127 S200 170 230 141 S300 125 345 129 S420 82 460 98 S535 117 575 100 S635 75 690 88"
          fill="none"
          stroke="#c3a66a"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
      </svg>
      <div className="chart-x">
        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
    </div>
  );
}
