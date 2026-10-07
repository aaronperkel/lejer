"use client";

import { CategoryScale, Chart, LineController, LineElement, LinearScale, PointElement, Tooltip, type Plugin } from "chart.js";
import { useEffect, useRef, useState } from "react";
import type { Series } from "@/lib/trends";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

// The trends line chart (Chart.js on a canvas). Colors are the theme's own tokens, read from the
// page (--series-N per slot, muted ink for "Other", ink and rules for the frame), so the chart
// is rebuilt whenever they can change: the household's theme or scheme (<html data-*>) and the
// device's light/dark preference. The legend is HTML: one toggle button per series, plus "last
// year", so it works with a keyboard and a screen reader. Each slot also has its own point
// shape, so identity never rests on color alone.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHAPES = ["circle", "rect", "triangle", "rectRot", "crossRot"] as const;
type Shape = (typeof SHAPES)[number] | "line";

const shapeFor = (slot: number | null): Shape => (slot ? SHAPES[(slot - 1) % SHAPES.length] : "line");
const colorVar = (slot: number | null) => (slot ? `--series-${slot}` : "--ink-muted");
const label = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ’${ym.slice(2, 4)}`;
/**
 * Direct labels: each line's name at its last point, in ink (identity never rests on color
 * alone), nudged apart so neighbors don't collide. Only for four lines or fewer, where they
 * help more than they crowd; the legend and tooltip still name everything.
 */
function endLabels(ink: string, font: string, names: string[]): Plugin<"line"> {
  return {
    id: "endLabels",
    afterDatasetsDraw(chart) {
      const labels: { y: number; x: number; text: string }[] = [];
      chart.data.datasets.forEach((ds, i) => {
        const text = names[i];
        if (!text || !chart.isDatasetVisible(i)) return;
        const data = ds.data as (number | null)[];
        let last = data.length - 1;
        while (last >= 0 && data[last] === null) last--;
        if (last < 0) return;
        const pt = chart.getDatasetMeta(i).data[last];
        labels.push({ x: pt.x + 9, y: pt.y, text });
      });
      if (labels.length === 0 || labels.length > 4) return;
      labels.sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
      const { ctx } = chart;
      ctx.save();
      ctx.font = `600 11px ${font}`;
      ctx.fillStyle = ink;
      ctx.textBaseline = "middle";
      for (const l of labels) ctx.fillText(l.text, l.x, l.y);
      ctx.restore();
    },
  };
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The legend swatch: a short stroke with the series' point shape, drawn in its color. */
function Swatch({ slot, dashed }: { slot: number | null; dashed?: boolean }) {
  const shape = shapeFor(slot);
  const stroke = `var(${colorVar(slot)})`;
  return (
    <svg className="legend-swatch shrink-0" width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <line x1="1" y1="6" x2="21" y2="6" stroke={stroke} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} strokeLinecap="round" />
      {!dashed && shape === "circle" && <circle cx="11" cy="6" r="3.5" fill={stroke} />}
      {!dashed && shape === "rect" && <rect x="7.5" y="2.5" width="7" height="7" fill={stroke} />}
      {!dashed && shape === "triangle" && <path d="M11 2 L15 9.5 L7 9.5 Z" fill={stroke} />}
      {!dashed && shape === "rectRot" && <path d="M11 1.5 L15.5 6 L11 10.5 L6.5 6 Z" fill={stroke} />}
      {!dashed && shape === "crossRot" && <path d="M7.5 2.5 L14.5 9.5 M14.5 2.5 L7.5 9.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

export default function TrendsChart({ months, series, summary }: { months: string[]; series: Series[]; summary: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [lastYear, setLastYear] = useState(false);
  const [themeTick, setThemeTick] = useState(0);
  const hasLastYear = series.some((s) => s.lastYear.some((v) => v !== null));

  // Rebuild when the theme can have changed: the household's look, or the device's scheme.
  useEffect(() => {
    const bump = () => setThemeTick((t) => t + 1);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-color-scheme"] });
    return () => {
      mq.removeEventListener("change", bump);
      mo.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const ink = token("--ink");
    const muted = token("--ink-muted");
    const grid = token("--line-soft");
    const rule = token("--line");
    const panel = token("--panel");
    const mono = token("--face-ledger") || "ui-monospace, monospace";
    const phone = window.innerWidth < 640;

    const visible = series.filter((s) => !hidden.has(s.key));
    const datasets = visible.flatMap((s) => {
      const color = token(colorVar(s.slot));
      const shape = shapeFor(s.slot);
      const now = {
        label: s.label,
        data: s.values,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointStyle: shape === "line" ? ("circle" as const) : shape,
        pointRadius: shape === "line" ? 2.5 : 4,
        pointHoverRadius: 6,
        pointBorderColor: panel, // a ring of the panel keeps overlapping points apart
        pointBorderWidth: 1.5,
        borderDash: s.slot ? [] : [2, 3],
        spanGaps: true,
        tension: 0.25,
      };
      if (!lastYear) return [now];
      return [
        now,
        {
          label: `${s.label}, a year earlier`,
          data: s.lastYear,
          borderColor: /^#[0-9a-f]{6}$/i.test(color) ? `${color}8c` : color, // 55% alpha; series tokens are hex
          backgroundColor: color,
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          pointHoverRadius: 4,
          spanGaps: true,
          tension: 0.25,
        },
      ];
    });

    // Names for the current-year lines only (not "a year earlier"), in dataset order.
    const names = visible.flatMap((s) => (lastYear ? [s.label, ""] : [s.label]));
    const labelled = !phone && visible.length <= 4;
    const chart = new Chart(el, {
      type: "line",
      data: { labels: months.map(label), datasets },
      plugins: labelled ? [endLabels(ink, mono, names)] : [],
      options: {
        layout: { padding: { right: labelled ? 72 : 0 } },
        responsive: true,
        maintainAspectRatio: false,
        // Drawn in place: the data isn't news, and a theme change shouldn't replay an entrance.
        animation: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: panel,
            titleColor: ink,
            bodyColor: ink,
            borderColor: rule,
            borderWidth: 1,
            padding: 12,
            cornerRadius: 6,
            titleFont: { family: mono, weight: "bold" },
            bodyFont: { family: mono },
            usePointStyle: true,
            boxPadding: 4,
            filter: (item) => item.parsed.y !== null,
            itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
            callbacks: { label: (c) => ` ${c.dataset.label}: ${money(Number(c.parsed.y))}` },
          },
        },
        scales: {
          x: {
            ticks: { color: muted, maxRotation: 0, autoSkipPadding: 12, font: { size: phone ? 10 : 11, family: mono } },
            grid: { display: false },
            border: { color: rule },
          },
          y: {
            beginAtZero: true,
            ticks: { color: muted, maxTicksLimit: 6, font: { size: 11, family: mono }, callback: (v) => `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
            grid: { color: grid },
            border: { display: false },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [months, series, hidden, lastYear, themeTick]);

  const toggle = (key: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Show or hide lines">
        {series.map((s) => (
          <button key={s.key} type="button" className="legend-toggle" aria-pressed={!hidden.has(s.key)} onClick={() => toggle(s.key)}>
            <Swatch slot={s.slot} />
            <span>
              {s.emoji ? `${s.emoji} ` : ""}
              {s.label}
            </span>
          </button>
        ))}
        {hasLastYear && (
          <button type="button" className="legend-toggle legend-option sm:ml-auto" aria-pressed={lastYear} onClick={() => setLastYear((v) => !v)}>
            <Swatch slot={null} dashed />
            <span>Compare with a year earlier</span>
          </button>
        )}
      </div>
      <div className="h-[260px] sm:h-[340px]">
        <canvas ref={canvas} role="img" aria-label={summary}>
          {summary}
        </canvas>
      </div>
    </div>
  );
}
