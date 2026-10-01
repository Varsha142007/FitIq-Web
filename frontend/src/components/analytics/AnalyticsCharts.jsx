import React, { useState } from "react";

/**
 * Parses YYYY-MM-DD safely into a local Date object without UTC timezone shifts.
 */
export const parseLocalDate = (dateStr) => {
  if (!dateStr) return new Date();
  if (typeof dateStr === "string" && dateStr.includes("-")) {
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
  }
  return new Date(dateStr);
};

export const formatLocalDate = (dateStr, options = { month: "short", day: "numeric" }) => {
  if (!dateStr) return "";
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString(undefined, options);
};

export const getWeekday = (dateStr) => {
  if (!dateStr) return "";
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "short" });
};

/**
 * Responsive Pure-SVG Line / Area Chart
 */
export function LineTrendChart({
  data = [],
  dataKey = "value",
  dateKey = "date",
  target = null,
  targetLabel = "Target",
  unit = "",
  color = "emerald",
  height = 180,
  minVal = null,
  maxVal = null,
  emptyMessage = "Need at least 2 check-ins for trend chart"
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const chartData = (data || []).filter((item) => {
    const value = Number(item?.[dataKey]);
    return item?.[dataKey] != null && Number.isFinite(value);
  });

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs py-10"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  // If only 1 data point, show single point visual
  if (chartData.length === 1) {
    const item = chartData[0];
    const val = item[dataKey];
    return (
      <div
        className="flex flex-col items-center justify-center bg-slate-50/60 rounded-xl border border-slate-100 p-6 text-center"
        style={{ height }}
      >
        <span className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-1">
          {formatLocalDate(item[dateKey])} (Baseline)
        </span>
        <span className="text-3xl font-extrabold text-slate-900 mb-1">
          {val !== null && val !== undefined ? val.toLocaleString() : "—"}{unit ? ` ${unit}` : ""}
        </span>
        <span className="text-xs text-slate-500">
          Complete another check-in to unlock your trend curve.
        </span>
      </div>
    );
  }

  const values = chartData.map((d) => Number(d[dataKey]));
  const rawMin = minVal !== null ? minVal : Math.min(...values);
  const rawMax = maxVal !== null ? maxVal : Math.max(...values, target || 0);
  
  // Padding for y-axis scale
  const yPadding = (rawMax - rawMin) * 0.15 || 5;
  const minY = Math.max(0, Math.floor(rawMin - yPadding));
  const maxY = Math.ceil(rawMax + yPadding) || 10;
  const yRange = maxY - minY || 1;

  // SVG viewBox dimensions
  const svgWidth = 600;
  const svgHeight = height;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 35;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const points = chartData.map((d, i) => {
    const val = Number(d[dataKey]);
    const x = padLeft + (i / (chartData.length - 1)) * plotWidth;
    const y = padTop + plotHeight - ((val - minY) / yRange) * plotHeight;
    return { x, y, val, item: d, idx: i };
  });

  const pathD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x},${padTop + plotHeight} L ${points[0].x},${padTop + plotHeight} Z`;

  const targetY =
    target !== null
      ? padTop + plotHeight - ((target - minY) / yRange) * plotHeight
      : null;

  const colorPalettes = {
    emerald: {
      stroke: "#10b981",
      fillStart: "rgba(16, 185, 129, 0.25)",
      fillEnd: "rgba(16, 185, 129, 0.0)",
      dot: "#059669",
      badge: "bg-emerald-50 text-emerald-700 border-emerald-200"
    },
    indigo: {
      stroke: "#6366f1",
      fillStart: "rgba(99, 102, 241, 0.25)",
      fillEnd: "rgba(99, 102, 241, 0.0)",
      dot: "#4f46e5",
      badge: "bg-indigo-50 text-indigo-700 border-indigo-200"
    },
    blue: {
      stroke: "#3b82f6",
      fillStart: "rgba(59, 130, 246, 0.25)",
      fillEnd: "rgba(59, 130, 246, 0.0)",
      dot: "#2563eb",
      badge: "bg-blue-50 text-blue-700 border-blue-200"
    },
    amber: {
      stroke: "#f59e0b",
      fillStart: "rgba(245, 158, 11, 0.25)",
      fillEnd: "rgba(245, 158, 11, 0.0)",
      dot: "#d97706",
      badge: "bg-amber-50 text-amber-700 border-amber-200"
    },
    purple: {
      stroke: "#8b5cf6",
      fillStart: "rgba(139, 92, 246, 0.25)",
      fillEnd: "rgba(139, 92, 246, 0.0)",
      dot: "#7c3aed",
      badge: "bg-purple-50 text-purple-700 border-purple-200"
    }
  };

  const palette = colorPalettes[color] || colorPalettes.emerald;
  const gradientId = `line-grad-${color}-${Math.random().toString(36).substring(2, 7)}`;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible select-none"
        style={{ maxHeight: height }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.fillStart} />
            <stop offset="100%" stopColor={palette.fillEnd} />
          </linearGradient>
        </defs>

        {/* Y-axis Grid Lines */}
        {[0, 0.5, 1].map((pct, i) => {
          const y = padTop + plotHeight * pct;
          const val = Math.round(maxY - pct * yRange);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={svgWidth - padRight}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {val.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Target Line */}
        {targetY !== null && targetY >= padTop && targetY <= padTop + plotHeight && (
          <g>
            <line
              x1={padLeft}
              y1={targetY}
              x2={svgWidth - padRight}
              y2={targetY}
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text
              x={svgWidth - padRight}
              y={targetY - 5}
              textAnchor="end"
              className="text-[10px] fill-slate-500 font-semibold"
            >
              {targetLabel}: {target.toLocaleString()}{unit ? ` ${unit}` : ""}
            </text>
          </g>
        )}

        {/* Area Fill */}
        <path d={areaD} fill={`url(#${gradientId})`} />

        {/* Line Stroke */}
        <path
          d={pathD}
          fill="none"
          stroke={palette.stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data Points */}
        {points.map((pt, i) => {
          const isHovered = hoveredIdx === i;
          return (
            <g
              key={i}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 7 : 4.5}
                fill="#ffffff"
                stroke={palette.stroke}
                strokeWidth={isHovered ? 3 : 2.5}
                className="transition-all duration-150"
              />
              {/* Invisible large touch target */}
              <circle cx={pt.x} cy={pt.y} r={18} fill="transparent" />
            </g>
          );
        })}

        {/* X-axis Labels */}
        {points.map((pt, i) => {
          // If too many points, show sparse labels
          const total = points.length;
          const showLabel =
            total <= 8 ||
            i === 0 ||
            i === total - 1 ||
            (total <= 16 && i % 2 === 0) ||
            i % 4 === 0;

          if (!showLabel) return null;

          return (
            <g key={i}>
              <text
                x={pt.x}
                y={svgHeight - 12}
                textAnchor="middle"
                className="text-[11px] fill-slate-500 font-medium"
              >
                {formatLocalDate(pt.item[dateKey], { month: "numeric", day: "numeric" })}
              </text>
              <text
                x={pt.x}
                y={svgHeight - 1}
                textAnchor="middle"
                className="text-[9px] fill-slate-400"
              >
                {getWeekday(pt.item[dateKey])}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoveredIdx !== null && points[hoveredIdx] && (
        <div
          className="absolute z-10 -top-2 transform -translate-x-1/2 pointer-events-none transition-all duration-100"
          style={{
            left: `${(points[hoveredIdx].x / svgWidth) * 100}%`
          }}
        >
          <div className="bg-slate-900/95 backdrop-blur text-white text-xs px-3 py-1.5 rounded-lg shadow-lg border border-slate-700/50 flex flex-col items-center whitespace-nowrap">
            <span className="text-[10px] text-slate-300 font-medium">
              {formatLocalDate(points[hoveredIdx].item[dateKey], {
                weekday: "short",
                month: "short",
                day: "numeric"
              })}
            </span>
            <span className="font-bold text-sm text-white">
              {points[hoveredIdx].val.toLocaleString()}{unit ? ` ${unit}` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Responsive Pure-SVG Bar Trend Chart
 */
export function BarTrendChart({
  data = [],
  dataKey = "value",
  dateKey = "date",
  target = null,
  targetLabel = "Target",
  unit = "",
  color = "emerald",
  height = 180,
  minVal = 0,
  emptyMessage = "No check-in records for this period"
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const chartData = (data || []).filter((item) => {
    const value = Number(item?.[dataKey]);
    return item?.[dataKey] != null && Number.isFinite(value);
  });

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs py-10"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  // If only 1 data point, show single baseline visual
  if (chartData.length === 1) {
    const item = chartData[0];
    const val = item[dataKey];
    return (
      <div
        className="flex flex-col items-center justify-center bg-slate-50/60 rounded-xl border border-slate-100 p-6 text-center"
        style={{ height }}
      >
        <span className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-1">
          {formatLocalDate(item[dateKey])} (Baseline)
        </span>
        <span className="text-3xl font-extrabold text-slate-900 mb-1">
          {val !== null && val !== undefined ? val.toLocaleString() : "—"}{unit ? ` ${unit}` : ""}
        </span>
        <span className="text-xs text-slate-500">
          Complete another check-in to unlock your trend comparison.
        </span>
      </div>
    );
  }

  const values = chartData.map((d) => Number(d[dataKey]));
  const rawMax = Math.max(...values, target || 0);
  const maxY = Math.ceil(rawMax * 1.15) || 10;

  const svgWidth = 600;
  const svgHeight = height;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 25;
  const padBottom = 35;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const barCount = chartData.length;
  const slotWidth = plotWidth / barCount;
  const barWidth = Math.min(36, Math.max(12, slotWidth * 0.58));

  const targetY =
    target !== null && target > 0
      ? padTop + plotHeight - (target / maxY) * plotHeight
      : null;

  const barColors = {
    emerald: {
      default: "#10b981",
      hover: "#059669",
      bg: "#ecfdf5"
    },
    indigo: {
      default: "#6366f1",
      hover: "#4f46e5",
      bg: "#eef2ff"
    },
    blue: {
      default: "#3b82f6",
      hover: "#2563eb",
      bg: "#eff6ff"
    },
    amber: {
      default: "#f59e0b",
      hover: "#d97706",
      bg: "#fffbeb"
    },
    cyan: {
      default: "#06b6d4",
      hover: "#0891b2",
      bg: "#ecfeff"
    }
  };

  const palette = barColors[color] || barColors.emerald;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible select-none"
        style={{ maxHeight: height }}
      >
        {/* Y Gridlines */}
        {[0, 0.5, 1].map((pct, i) => {
          const y = padTop + plotHeight * pct;
          const val = Math.round(maxY - pct * maxY);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={svgWidth - padRight}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={padLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {val.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Target Reference Line */}
        {targetY !== null && targetY >= padTop && targetY <= padTop + plotHeight && (
          <g>
            <line
              x1={padLeft}
              y1={targetY}
              x2={svgWidth - padRight}
              y2={targetY}
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text
              x={svgWidth - padRight}
              y={targetY - 5}
              textAnchor="end"
              className="text-[10px] fill-slate-500 font-semibold"
            >
              {targetLabel}: {target.toLocaleString()}{unit ? ` ${unit}` : ""}
            </text>
          </g>
        )}

        {/* Bars */}
        {chartData.map((item, i) => {
          const val = Number(item[dataKey]);
          const barH = Math.max(3, (val / maxY) * plotHeight);
          const x = padLeft + i * slotWidth + (slotWidth - barWidth) / 2;
          const y = padTop + plotHeight - barH;
          const isHovered = hoveredIdx === i;

          return (
            <g
              key={i}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Subtle background slot */}
              <rect
                x={x - 2}
                y={padTop}
                width={barWidth + 4}
                height={plotHeight}
                fill={isHovered ? palette.bg : "transparent"}
                rx="6"
                className="transition-colors duration-150"
              />
              {/* Actual bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                fill={isHovered ? palette.hover : palette.default}
                rx="4"
                className="transition-all duration-150"
              />
              {/* Invisible touch target */}
              <rect
                x={padLeft + i * slotWidth}
                y={padTop}
                width={slotWidth}
                height={plotHeight + padBottom}
                fill="transparent"
              />
            </g>
          );
        })}

        {/* X-axis Labels */}
        {chartData.map((item, i) => {
          const x = padLeft + i * slotWidth + slotWidth / 2;
          const total = chartData.length;
          const showLabel =
            total <= 8 ||
            i === 0 ||
            i === total - 1 ||
            (total <= 16 && i % 2 === 0) ||
            i % 4 === 0;

          if (!showLabel) return null;

          return (
            <g key={i}>
              <text
                x={x}
                y={svgHeight - 12}
                textAnchor="middle"
                className="text-[11px] fill-slate-500 font-medium"
              >
                {formatLocalDate(item[dateKey], { month: "numeric", day: "numeric" })}
              </text>
              <text
                x={x}
                y={svgHeight - 1}
                textAnchor="middle"
                className="text-[9px] fill-slate-400"
              >
                {getWeekday(item[dateKey])}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoveredIdx !== null && chartData[hoveredIdx] && (
        <div
          className="absolute z-10 -top-2 transform -translate-x-1/2 pointer-events-none transition-all duration-100"
          style={{
            left: `${((padLeft + hoveredIdx * slotWidth + slotWidth / 2) / svgWidth) * 100}%`
          }}
        >
          <div className="bg-slate-900/95 backdrop-blur text-white text-xs px-3 py-1.5 rounded-lg shadow-lg border border-slate-700/50 flex flex-col items-center whitespace-nowrap">
            <span className="text-[10px] text-slate-300 font-medium">
              {formatLocalDate(chartData[hoveredIdx][dateKey], {
                weekday: "short",
                month: "short",
                day: "numeric"
              })}
            </span>
            <span className="font-bold text-sm text-white">
              {Number(chartData[hoveredIdx][dataKey]).toLocaleString()}{unit ? ` ${unit}` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Calendar-style Tracking Matrix / Grid
 * Shows each calendar day in the window with ✓ for tracked and ○ for untracked.
 */
export function CalendarTrackingMatrix({
  daysCount = 7,
  checkIns = []
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Map of date string -> checkIn
  const checkInMap = new Map();
  checkIns.forEach((c) => {
    if (c.date) checkInMap.set(c.date, c);
  });

  const days = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dayNum = String(d.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${dayNum}`;
    const checkIn = checkInMap.get(key) || null;
    days.push({
      dateStr: key,
      dateObj: d,
      isToday: i === 0,
      tracked: Boolean(checkIn),
      checkIn
    });
  }

  const trackedCount = days.filter((d) => d.tracked).length;
  const pct = Math.round((trackedCount / daysCount) * 100);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-3">
        <span>
          <strong className="text-slate-900 font-bold">{trackedCount}</strong> of{" "}
          <strong className="text-slate-900 font-bold">{daysCount}</strong> days tracked ({pct}%)
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Tracked
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block" />
            Untracked
          </span>
        </span>
      </div>

      {/* Responsive Grid */}
      <div
        className={`grid gap-1.5 ${
          daysCount === 7
            ? "grid-cols-7"
            : daysCount === 30
            ? "grid-cols-10 md:grid-cols-15"
            : "grid-cols-10 md:grid-cols-18"
        }`}
      >
        {days.map((d, idx) => {
          return (
            <div
              key={idx}
              title={`${formatLocalDate(d.dateStr)}: ${
                d.tracked
                  ? `Completed (${d.checkIn?.steps != null ? `${d.checkIn.steps.toLocaleString()} steps` : "steps not recorded"}, ${
                      d.checkIn?.sleepHours != null ? `${d.checkIn.sleepHours}h sleep` : "sleep not recorded"
                    })`
                  : "Not tracked"
              }`}
              className={`group relative flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 ${
                d.tracked
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-xs hover:bg-emerald-100 hover:border-emerald-300"
                  : "bg-slate-50 border border-slate-200/70 text-slate-400 hover:bg-slate-100"
              } ${d.isToday ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}
            >
              <span className="text-[10px] font-semibold uppercase leading-none mb-1">
                {d.dateObj.toLocaleDateString(undefined, { weekday: "narrow" })}
              </span>
              <div className="flex items-center justify-center">
                {d.tracked ? (
                  <span className="text-emerald-600 font-bold text-xs">✓</span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                )}
              </div>
              <span className="text-[9px] font-mono mt-1 opacity-75">
                {d.dateObj.getDate()}
              </span>

              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-1.5 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                <div className="bg-slate-900 text-white text-[10px] px-2 py-1 rounded shadow-md whitespace-nowrap">
                  <p className="font-bold">{formatLocalDate(d.dateStr)}</p>
                  {d.tracked ? (
                    <p className="text-emerald-300">
                      {d.checkIn?.steps != null
                        ? `${d.checkIn.steps.toLocaleString()} steps`
                        : "steps not recorded"}{" "}
                      • {d.checkIn?.sleepHours != null
                        ? `${d.checkIn.sleepHours}h sleep`
                        : "sleep not recorded"}
                    </p>
                  ) : (
                    <p className="text-slate-300">No check-in</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Dual-Metric Relationship Chart (Behavior Analytics)
 * Shows Steps and Sleep side by side across actual check-ins.
 */
export function DualHabitChart({ checkIns = [] }) {
  const chartData = (checkIns || []).filter((record) => (
    record.steps != null &&
    record.sleepHours != null &&
    Number.isFinite(Number(record.steps)) &&
    Number.isFinite(Number(record.sleepHours))
  ));

  if (chartData.length < 2) {
    return (
      <div className="flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs py-10">
        Requires at least 2 check-ins with both steps and sleep recorded
      </div>
    );
  }

  const maxSteps = Math.max(...chartData.map((record) => Number(record.steps)), 10000);
  const maxSleep = 12;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-4 pb-2 border-b border-slate-100">
        <span className="font-semibold text-slate-700">Date-by-Date Habit Co-occurrence</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
            Steps
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" />
            Sleep (hrs)
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {chartData.slice(-7).map((c, idx) => {
          const steps = Number(c.steps);
          const sleep = Number(c.sleepHours);
          const stepsPct = Math.min(100, Math.round((steps / maxSteps) * 100));
          const sleepPct = Math.min(100, Math.round((sleep / maxSleep) * 100));

          return (
            <div key={idx} className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-100">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
                <span>{formatLocalDate(c.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {steps.toLocaleString()} steps • {sleep} hrs
                </span>
              </div>
              <div className="space-y-1">
                {/* Steps bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-emerald-600 w-10">Activity</span>
                  <div className="flex-1 h-2 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${stepsPct}%` }}
                    />
                  </div>
                </div>
                {/* Sleep bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-indigo-600 w-10">Sleep</span>
                  <div className="flex-1 h-2 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${sleepPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Metric Progress Bar (Used for Macronutrients and Targets)
 */
export function TargetProgressBar({
  label,
  consumed = null,
  target = null,
  unit = "g",
  color = "emerald"
}) {
  const colorMap = {
    emerald: "bg-emerald-500 text-emerald-700",
    red: "bg-rose-500 text-rose-700",
    yellow: "bg-amber-500 text-amber-700",
    indigo: "bg-indigo-500 text-indigo-700",
    blue: "bg-blue-500 text-blue-700"
  };

  const activeColor = colorMap[color] || colorMap.emerald;
  const hasConsumed = consumed !== null && consumed !== undefined;
  const pct = hasConsumed && target ? Math.min(100, Math.round((consumed / target) * 100)) : 0;

  return (
    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-semibold text-slate-700">{label}</span>
        <div className="text-right">
          {hasConsumed ? (
            <span className="font-bold text-slate-900">
              {consumed} / {target || "—"} {unit}
              <span className="text-[10px] text-slate-500 font-normal ml-1">({pct}%)</span>
            </span>
          ) : (
            <span className="text-slate-400 font-medium">
              No intake recorded (Target: {target || "—"}{unit})
            </span>
          )}
        </div>
      </div>
      <div className="h-2 w-full bg-slate-200/70 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${activeColor.split(" ")[0]}`}
          style={{ width: `${hasConsumed ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Cohort Comparison Bar (You vs Similar Users)
 */
export function CohortComparisonItem({
  label,
  userVal,
  cohortVal,
  unit = "",
  higherIsBetter = true
}) {
  const userValue = userVal == null ? null : Number(userVal);
  const cohortValue = cohortVal == null ? null : Number(cohortVal);
  const hasUserValue = userValue !== null && Number.isFinite(userValue);
  const hasCohortValue = cohortValue !== null && Number.isFinite(cohortValue);
  const maxVal =
    Math.max(
      ...(hasUserValue ? [userValue] : []),
      ...(hasCohortValue ? [cohortValue] : []),
      0
    ) * 1.2 || 1;
  const userPct = hasUserValue
    ? Math.min(100, Math.round((userValue / maxVal) * 100))
    : 0;
  const cohortPct = hasCohortValue
    ? Math.min(100, Math.round((cohortValue / maxVal) * 100))
    : 0;

  const diff = hasUserValue && hasCohortValue
    ? userValue - cohortValue
    : null;
  const diffSign = diff > 0 ? "+" : "";

  return (
    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
      <div className="flex justify-between items-center text-xs font-semibold mb-2">
        <span className="text-slate-800">{label}</span>
        <span className="text-[11px] font-mono">
          {diff === null ? (
            <span className="text-slate-500">Building baseline</span>
          ) : diff === 0 ? (
            <span className="text-slate-500">Matching cohort</span>
          ) : (
            <span
              className={
                (diff > 0 && higherIsBetter) || (diff < 0 && !higherIsBetter)
                  ? "text-emerald-600 font-bold"
                  : "text-slate-600 font-bold"
              }
            >
              {diffSign}
              {typeof diff === "number" ? diff.toFixed(1) : diff} {unit} vs cohort
            </span>
          )}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-cyan-700 w-12">You</span>
          <div className="flex-1 h-2 bg-slate-200/70 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all"
              style={{ width: `${userPct}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-700 w-14 text-right">
            {hasUserValue ? `${userValue.toLocaleString()} ${unit}` : "Not recorded"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-slate-500 w-12">Cohort</span>
          <div className="flex-1 h-2 bg-slate-200/70 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-400 rounded-full transition-all"
              style={{ width: `${cohortPct}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 w-14 text-right">
            {hasCohortValue ? `${cohortValue.toLocaleString()} ${unit}` : "Not available"}
          </span>
        </div>
      </div>
    </div>
  );
}
