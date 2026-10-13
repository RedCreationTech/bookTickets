const colors = [
  "#277e6d",
  "#8fb9a5",
  "#d0ac6c",
  "#6f91ad",
  "#9c899f",
  "#a2b876",
];
export function DynamicBars({
  rows,
  label,
}: {
  rows: { name: string; count: number }[];
  label: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div role="img" aria-label={label}>
      {rows.map((row) => (
        <div
          key={row.name}
          style={{
            display: "grid",
            gridTemplateColumns: "100px 1fr 42px",
            gap: 8,
            alignItems: "center",
            margin: "8px 0",
          }}
        >
          <span style={{ fontSize: 11 }}>{row.name}</span>
          <div style={{ background: "#edf3ef", height: 16, borderRadius: 5 }}>
            <div
              data-value={row.count}
              style={{
                background: "#277e6d",
                width: `${(row.count / max) * 100}%`,
                height: "100%",
                borderRadius: 5,
              }}
            />
          </div>
          <strong>{row.count}</strong>
        </div>
      ))}
      {!rows.length && <p>暂无数据</p>}
    </div>
  );
}
export function DynamicPie({
  rows,
  label,
}: {
  rows: { name: string; count: number }[];
  label: string;
}) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  let angle = -Math.PI / 2;
  return (
    <div
      style={{
        display: "flex",
        gap: 22,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <svg
        width="190"
        height="190"
        viewBox="0 0 200 200"
        role="img"
        aria-label={`${label}，合计${total}`}
      >
        <circle cx="100" cy="100" r="85" fill="#edf3ef" />
        {rows.map((row, i) => {
          const start = angle;
          const sweep = total ? (row.count / total) * Math.PI * 2 : 0;
          angle += sweep;
          const x1 = 100 + 85 * Math.cos(start),
            y1 = 100 + 85 * Math.sin(start),
            x2 = 100 + 85 * Math.cos(angle),
            y2 = 100 + 85 * Math.sin(angle);
          return sweep >= Math.PI * 2 - 0.0001 ? (
            <circle
              key={row.name}
              cx="100"
              cy="100"
              r="85"
              fill={colors[i % colors.length]}
            >
              <title>
                {row.name}：{row.count}
              </title>
            </circle>
          ) : (
            <path
              key={row.name}
              d={`M100 100L${x1} ${y1}A85 85 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2} ${y2}Z`}
              fill={colors[i % colors.length]}
            >
              <title>
                {row.name}：{row.count}
              </title>
            </path>
          );
        })}
        <circle cx="100" cy="100" r="45" fill="white" />
        <text x="100" y="106" textAnchor="middle" fontSize="24" fill="#285344">
          {total}
        </text>
      </svg>
      <ul style={{ paddingLeft: 18 }}>
        {rows.map((row, i) => (
          <li
            key={row.name}
            style={{ color: colors[i % colors.length], margin: "8px 0" }}
          >
            {row.name}：{row.count}（
            {total ? ((row.count / total) * 100).toFixed(1) : "0.0"}%）
          </li>
        ))}
      </ul>
    </div>
  );
}
