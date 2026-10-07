"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

// The home page's plan: a sample four-bedroom household drawn as a floor plan. Each bill is a
// utility line that runs from the meters along the hall and drops into the room of whoever
// fronts it, then into every room that splits it, where the share is written on. Rooms, shares
// and controls are HTML (readable without JS); the lines are an SVG overlay measured from them.
// Names and amounts match the /demo household (lib/demo.ts) and are labeled as a sample.

export type UtilId = "electric" | "gas" | "water" | "wifi";
type Mode = "single" | "ledger";

interface Util {
  id: UtilId;
  name: string;
  total: number;
  share: number;
  /** Who fronts it in ledger mode. In single-payer mode the payer fronts everything. */
  owner: string;
  dash: string;
}

const PEOPLE = ["Robin", "Jordan", "Casey", "Morgan"] as const;
const PAYER = "Robin";

// Split four ways; the owner counts in the denominator but owes nothing.
const UTILS: Util[] = [
  { id: "electric", name: "Electric", total: 104.12, share: 26.03, owner: "Jordan", dash: "13 3 3 3" },
  { id: "gas", name: "Gas", total: 62.4, share: 15.6, owner: "Casey", dash: "9 5" },
  { id: "water", name: "Water", total: 43.16, share: 10.79, owner: "Morgan", dash: "1.5 4.5" },
  { id: "wifi", name: "Wifi", total: 79.99, share: 20.0, owner: "Robin", dash: "15 3 1.5 3 1.5 3" },
];

// Who has already paid back, per mode and bill, so the sample opens mid-month.
const PAID_AT_START = [
  "ledger:electric:Casey",
  "ledger:gas:Jordan",
  "ledger:wifi:Jordan",
  "ledger:wifi:Morgan",
  "single:electric:Jordan",
  "single:water:Casey",
  "single:wifi:Jordan",
  "single:wifi:Casey",
];

const money = (n: number) => `$${n.toFixed(2)}`;

/** A share as the plan's figure: the dollar sign set small so the digits carry the size. */
function Figure({ n, live }: { n: number; live?: boolean }) {
  return (
    <span className="fp-figure" aria-live={live ? "polite" : undefined}>
      <span className="fp-cur">$</span>
      {n.toFixed(2)}
    </span>
  );
}

interface Geometry {
  w: number;
  h: number;
  hall: { left: number; right: number; top: number; bottom: number };
  meterLeft: number;
  /** Per room: the drop's x, where it ends at the share, and the wall gap it passes through. */
  rooms: Record<string, { x: number; chipY: number; gapTop: number; gapBottom: number }>;
}

export default function FloorPlan({ due }: { due: Record<UtilId, string> }) {
  const [mode, setMode] = useState<Mode>("ledger");
  const [selected, setSelected] = useState<UtilId>("electric");
  const [paid, setPaid] = useState(() => new Set(PAID_AT_START));
  const [geo, setGeo] = useState<Geometry | null>(null);
  // Bumped on every redraw so the drop animation replays.
  const [draw, setDraw] = useState(0);
  const plan = useRef<HTMLDivElement>(null);
  // Measured lane-label widths, so each label can be set in a gap clear of every drop.
  const [labelW, setLabelW] = useState<Record<string, number>>({});
  const labels = useRef<Record<string, SVGTextElement | null>>({});

  const util = UTILS.find((u) => u.id === selected)!;
  const ownerOf = useCallback((u: Util) => (mode === "single" ? PAYER : u.owner), [mode]);
  const owner = ownerOf(util);
  const isPaid = (person: string) => paid.has(`${mode}:${selected}:${person}`);
  const debtors = PEOPLE.filter((p) => p !== owner);
  const stillOwe = debtors.filter((p) => !isPaid(p));

  const measure = useCallback(() => {
    const el = plan.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const rel = (r: DOMRect) => ({ left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top });
    const hallEl = el.querySelector<HTMLElement>("[data-hall]");
    const meterEl = el.querySelector<HTMLElement>("[data-meter]");
    if (!hallEl || !meterEl) return;
    const hall = rel(hallEl.getBoundingClientRect());
    const rooms: Geometry["rooms"] = {};
    for (const room of el.querySelectorAll<HTMLElement>("[data-room]")) {
      const chip = room.querySelector<HTMLElement>("[data-outlet]");
      if (!chip) continue;
      const r = rel(room.getBoundingClientRect());
      const c = rel(chip.getBoundingClientRect());
      const top = r.bottom <= hall.top + 1;
      rooms[room.dataset.room!] = {
        x: c.left + 14,
        chipY: top ? c.bottom : c.top,
        gapTop: top ? r.bottom : hall.bottom,
        gapBottom: top ? hall.top : r.top,
      };
    }
    setGeo({ w: box.width, h: box.height, hall, meterLeft: rel(meterEl.getBoundingClientRect()).left, rooms });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (plan.current) ro.observe(plan.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  const choose = (id: UtilId) => {
    setSelected(id);
    setDraw((d) => d + 1);
  };
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    setDraw((d) => d + 1);
  };
  const toggle = (person: string) =>
    setPaid((prev) => {
      const next = new Set(prev);
      const key = `${mode}:${selected}:${person}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    for (const u of UTILS) next[u.id] = Math.ceil(labels.current[u.id]?.getComputedTextLength() ?? 0);
    setLabelW((prev) => (UTILS.every((u) => prev[u.id] === next[u.id]) ? prev : next));
  }, [geo, selected]);

  const laneY = (i: number) => (geo ? geo.hall.top + ((geo.hall.bottom - geo.hall.top) * (i + 1)) / (UTILS.length + 1) : 0);
  const selIndex = UTILS.findIndex((u) => u.id === selected);

  // Drops in drawing order: the owner's first (the bill reaches them), then the rest by distance.
  const drops = useMemo(() => {
    if (!geo) return [];
    return PEOPLE.filter((p) => geo.rooms[p])
      .map((p) => ({ person: p, ...geo.rooms[p] }))
      .sort((a, b) => (a.person === owner ? -1 : b.person === owner ? 1 : b.x - a.x));
  }, [geo, owner]);

  // The rightmost gap along the hall (between the hall's end, the drops and the meters) that
  // holds the label; its right edge is where the label ends. Falls back to beside the meters.
  const labelX = (w: number) => {
    if (!geo) return 0;
    const edges = [geo.hall.left + 10, ...drops.map((d) => d.x).sort((a, b) => a - b), geo.meterLeft];
    for (let i = edges.length - 1; i > 0; i--) {
      if (edges[i] - edges[i - 1] >= w + 22) return edges[i] - 10;
    }
    return geo.meterLeft - 8;
  };

  const summary =
    mode === "single"
      ? `${PAYER} pays every bill, so everyone else owes ${PAYER}. ${util.name} is ${money(util.total)}, split four ways: ${money(util.share)} each.`
      : `${owner} fronts ${util.name}. It's ${money(util.total)}, split four ways: ${money(util.share)} each, and ${owner}'s own share is already covered.`;

  return (
    <div className="fp">
      <div className="fp-controls">
        <fieldset className="fp-mode">
          <legend className="fp-control-label">Who fronts the bills?</legend>
          <div className="fp-seg">
            <button type="button" aria-pressed={mode === "single"} onClick={() => switchMode("single")}>
              One person pays
            </button>
            <button type="button" aria-pressed={mode === "ledger"} onClick={() => switchMode("ledger")}>
              Each bill has an owner
            </button>
          </div>
        </fieldset>
        <div className="fp-legend" role="group" aria-label="This month's bills">
          <span className="fp-control-label" aria-hidden="true">
            This month&apos;s bills
          </span>
          <div className="fp-bills">
            {UTILS.map((u) => (
              <button key={u.id} type="button" className="fp-bill" data-util={u.id} aria-pressed={u.id === selected} onClick={() => choose(u.id)}>
                <svg className="fp-swatch" viewBox="0 0 44 8" aria-hidden="true">
                  <line x1="1" y1="4" x2="43" y2="4" strokeDasharray={u.dash} />
                </svg>
                <span className="fp-bill-name">{u.name}</span>
                <span className="fp-bill-total">{money(u.total)}</span>
                <span className="fp-bill-owner">{ownerOf(u)} fronts it</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fp-plan" ref={plan} data-util={selected}>
        {PEOPLE.map((person, i) => {
          const isOwner = person === owner;
          const done = isPaid(person);
          return (
            <div key={person} className="fp-room" data-room={person} data-side={i < 2 ? "top" : "bottom"} style={{ gridArea: `r${i + 1}` }}>
              <div className="fp-room-label">
                <span className="fp-room-no">Bedroom {i + 1}</span>
                <span className="fp-room-person">{person}</span>
              </div>
              {isOwner ? (
                <div className="fp-share fp-share-owner" data-outlet="">
                  <Figure n={util.share * stillOwe.length} live />
                  <span className="fp-caption">
                    {stillOwe.length === 0
                      ? `fronted ${money(util.total)}, all paid back`
                      : `owed back · fronted ${money(util.total)}`}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className="fp-share"
                  data-outlet=""
                  aria-pressed={done}
                  aria-label={`${person}'s share of ${util.name}, ${money(util.share)}, ${done ? `paid to ${owner}` : `owed to ${owner}`}. ${done ? "Uncheck" : "Check off as paid"}.`}
                  onClick={() => toggle(person)}
                >
                  <Figure n={util.share} />
                  <span className="fp-check" aria-hidden="true">
                    <svg viewBox="0 0 16 16">
                      <rect x="1" y="1" width="14" height="14" />
                      {done && <path d="M4 8.5l2.6 2.6L12 5.4" />}
                    </svg>
                  </span>
                  <span className="fp-caption">
                    {done ? `paid ${owner}` : `owes ${owner} · due ${due[selected]}`}
                  </span>
                </button>
              )}
            </div>
          );
        })}
        <div className="fp-room fp-room-quiet" style={{ gridArea: "kit" }} aria-hidden="true">
          <span className="fp-room-no">Kitchen</span>
        </div>
        <div className="fp-room fp-room-quiet" style={{ gridArea: "liv" }} aria-hidden="true">
          <span className="fp-room-no">Living</span>
        </div>
        <div className="fp-hall" style={{ gridArea: "hall" }} data-hall="" aria-hidden="true">
          <div className="fp-meter" data-meter="">
            <span>Meters</span>
          </div>
        </div>

        {geo && (
          <svg className="fp-lines" viewBox={`0 0 ${geo.w} ${geo.h}`} width={geo.w} height={geo.h} aria-hidden="true">
            {/* Door openings: gaps in the poché where the drops pass from the hall into each room. */}
            {Object.values(geo.rooms).map((r, i) => (
              <rect key={i} className="fp-door" x={r.x - 16} width={32} y={r.gapTop - 0.5} height={r.gapBottom - r.gapTop + 1} />
            ))}
            {UTILS.map((u, i) => {
              const y = laneY(i);
              const on = u.id === selected;
              return (
                <g key={u.id} className="fp-lane" data-util={u.id} data-on={on || undefined}>
                  <line className="fp-trunk" x1={geo.meterLeft} x2={geo.hall.left + 10} y1={y} y2={y} strokeDasharray={u.dash} />
                </g>
              );
            })}
            <g key={`${draw}-${mode}-${selected}`} className="fp-drops" data-util={selected}>
              {drops.map((d, n) => {
                const y = laneY(selIndex);
                const path = `M${d.x} ${y} V${d.chipY}`;
                const isOwner = d.person === owner;
                const done = isPaid(d.person);
                // Pencil first, then ink: the draft line sweeps in and the colored line resolves over it.
                const pencil = { animationDelay: `${n * 110}ms` };
                const style = { animationDelay: `${n * 110 + 300}ms` };
                return (
                  <g key={d.person} className="fp-drop" data-owner={isOwner || undefined} data-paid={done || undefined}>
                    <path className="fp-drop-draft" d={path} pathLength={1} style={pencil} />
                    <path className="fp-drop-ink" d={path} strokeDasharray={isOwner || done ? undefined : util.dash} style={style} />
                    {isOwner ? (
                      <rect className="fp-terminal" x={d.x - 4.5} y={y - 4.5} width={9} height={9} style={style} />
                    ) : (
                      <circle className="fp-terminal" cx={d.x} cy={y} r={3.5} style={style} />
                    )}
                  </g>
                );
              })}
            </g>
            {/* Lane labels last, haloed in the sheet color, so a drop passes under a label, never through it. */}
            {UTILS.map((u, i) => (
              <text
                key={u.id}
                ref={(el) => {
                  labels.current[u.id] = el;
                }}
                className="fp-lane-label"
                data-on={u.id === selected || undefined}
                x={labelX(labelW[u.id] ?? 0)}
                y={laneY(i) - 4}
                textAnchor="end"
              >
                {`${u.name.toUpperCase()} ${money(u.total)}`}
              </text>
            ))}
          </svg>
        )}
      </div>

      <p className="fp-summary" aria-live="polite">
        {summary}{" "}
        {stillOwe.length === 0
          ? "Everyone has paid back."
          : `${stillOwe.join(stillOwe.length === 2 ? " and " : ", ")} still ${stillOwe.length === 1 ? "owes" : "owe"}. Tap a share to check it off.`}
      </p>
      <p className="fp-sample">Sample household. Names and amounts are made up.</p>
    </div>
  );
}
