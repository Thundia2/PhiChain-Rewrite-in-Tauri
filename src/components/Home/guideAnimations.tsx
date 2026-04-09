// ============================================================
// Editor Guide — Animation Components
//
// Interactive SVG animations that demonstrate editor concepts:
// coordinate system, note falling, event transitions, easing
// curves. Each animation is self-contained and driven by
// useAnimationLoop from guideComponents.
// ============================================================

import { useRef, useEffect, useState } from "react";
import { useAnimationLoop, EasingMini } from "./guideComponents";
import { NOTE_TYPES, easingFns, EASING_NAMES, EASING_FAMILIES } from "./guideData";

const PI = Math.PI;

// ---- Coordinate System (Canvas tab) ----

export function CanvasCoordAnimation({ active }: { active: boolean }) {
  const svgRef = useRef<SVGGElement>(null);
  const labelXRef = useRef<SVGTextElement>(null);
  const labelYRef = useRef<SVGTextElement>(null);
  const trailRef = useRef<SVGGElement>(null);
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 6) / 6;
      const x = Math.sin(2 * PI * t) * 80;
      const y = Math.sin(4 * PI * t) * 50;
      const cx = 150 + x, cy = 100 + y;

      if (svgRef.current) svgRef.current.setAttribute("transform", `translate(${cx}, ${cy})`);
      if (labelXRef.current) labelXRef.current.textContent = `X: ${Math.round(x / 80 * 675)}`;
      if (labelYRef.current) labelYRef.current.textContent = `Y: ${Math.round(-y / 50 * 450)}`;

      if (trailRef.current) {
        const children = trailRef.current.children;
        for (let i = 0; i < 4; i++) {
          const tt = ((timeRef.current - (i + 1) * 0.12) % 6) / 6;
          const tx = 150 + Math.sin(2 * PI * tt) * 80;
          const ty = 100 + Math.sin(4 * PI * tt) * 50;
          if (children[i]) {
            children[i].setAttribute("cx", String(tx));
            children[i].setAttribute("cy", String(ty));
          }
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, timeRef]);

  return (
    <svg width="100%" height="200" viewBox="0 0 300 200" style={{ display: "block", margin: "0 auto" }}>
      <rect x="30" y="10" width="240" height="180" fill="var(--bg-primary)" stroke="var(--border-color)" strokeWidth="1" rx="4" />
      <line x1="150" y1="10" x2="150" y2="190" stroke="#333" strokeWidth="0.5" strokeDasharray="3,3" />
      <line x1="30" y1="100" x2="270" y2="100" stroke="#333" strokeWidth="0.5" strokeDasharray="3,3" />
      <text x="150" y="8" textAnchor="middle" fill="#51cf66" fontSize="8">+450</text>
      <text x="150" y="198" textAnchor="middle" fill="#ff6b6b" fontSize="8">-450</text>
      <text x="274" y="103" textAnchor="start" fill="#51cf66" fontSize="8">+675</text>
      <text x="26" y="103" textAnchor="end" fill="#ff6b6b" fontSize="8">-675</text>
      <text x="160" y="96" fill="#555" fontSize="7">(0, 0)</text>
      <g ref={trailRef}>
        {[0.15, 0.1, 0.06, 0.03].map((op, i) => (
          <circle key={i} cx="150" cy="100" r="3" fill="var(--accent-primary)" opacity={op} />
        ))}
      </g>
      <g ref={svgRef}>
        <line x1="-25" y1="0" x2="25" y2="0" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="0" cy="0" r="2.5" fill="var(--accent-primary)" />
      </g>
      <rect x="105" y="172" width="90" height="18" rx="4" fill="var(--bg-active)" opacity="0.85" />
      <text ref={labelXRef} x="128" y="184" textAnchor="middle" fill="#ff6b6b" fontSize="9" fontFamily="monospace">X: 0</text>
      <text ref={labelYRef} x="172" y="184" textAnchor="middle" fill="#51cf66" fontSize="9" fontFamily="monospace">Y: 0</text>
    </svg>
  );
}

// ---- Above / Below (Canvas tab) ----

export function AboveBelowAnimation({ active }: { active: boolean }) {
  const aboveRef = useRef<SVGRectElement>(null);
  const belowRef = useRef<SVGRectElement>(null);
  const flashRef = useRef<SVGCircleElement>(null);
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 3) / 3;
      const progress = Math.min(t / 0.7, 1);
      const lineY = 60;
      const aboveY = lineY - 45 + progress * 45;
      const belowY = lineY + 45 - progress * 45;

      if (aboveRef.current) aboveRef.current.setAttribute("y", String(aboveY - 4));
      if (belowRef.current) belowRef.current.setAttribute("y", String(belowY - 4));

      if (flashRef.current) {
        const hitPhase = t > 0.7 ? (t - 0.7) / 0.15 : 0;
        const flashOpacity = hitPhase > 0 && hitPhase < 1 ? 1 - hitPhase : 0;
        const flashR = 3 + hitPhase * 12;
        flashRef.current.setAttribute("r", String(flashR));
        flashRef.current.setAttribute("opacity", String(flashOpacity));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, timeRef]);

  return (
    <svg width="100%" height="120" viewBox="0 0 240 120" style={{ display: "block" }}>
      <line x1="50" y1="60" x2="190" y2="60" stroke="var(--accent-primary)" strokeWidth="2" />
      <rect ref={aboveRef} x="95" y="15" width="20" height="8" rx="2" fill="#48b5ff" />
      <text x="75" y="20" fill="var(--text-muted)" fontSize="8">above</text>
      <rect ref={belowRef} x="125" y="105" width="20" height="8" rx="2" fill="#48b5ff" />
      <text x="155" y="112" fill="var(--text-muted)" fontSize="8">below</text>
      <circle ref={flashRef} cx="120" cy="60" r="3" fill="white" opacity="0" />
    </svg>
  );
}

// ---- Note Falling (Notes tab) ----

export function NoteFallingAnimation({ active }: { active: boolean }) {
  const noteRefs = useRef<(SVGGElement | null)[]>([]);
  const flashRefs = useRef<(SVGCircleElement | null)[]>([]);
  const holdBarRef = useRef<SVGRectElement>(null);
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 3) / 3;
      const startY = 10, lineY = 130;
      const progress = Math.min(t / 0.75, 1);
      const y = startY + progress * (lineY - startY);

      for (let i = 0; i < 4; i++) {
        const el = noteRefs.current[i];
        if (el) el.setAttribute("transform", `translate(0, ${y})`);

        const fl = flashRefs.current[i];
        if (fl) {
          const hitPhase = t > 0.75 ? (t - 0.75) / 0.12 : 0;
          const op = hitPhase > 0 && hitPhase < 1 ? 1 - hitPhase : 0;
          fl.setAttribute("r", String(3 + hitPhase * 10));
          fl.setAttribute("opacity", String(op));
        }
      }
      if (holdBarRef.current) {
        const holdH = Math.max(0, progress * 40);
        holdBarRef.current.setAttribute("height", String(holdH));
        holdBarRef.current.setAttribute("y", String(y - holdH));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, timeRef]);

  const laneW = 55, lineY = 130;
  return (
    <svg width="100%" height="160" viewBox="0 0 240 160" style={{ display: "block", margin: "0 auto" }}>
      {[0, 1, 2, 3, 4].map(i => (
        <line key={i} x1={10 + i * laneW} y1="0" x2={10 + i * laneW} y2="160" stroke="var(--border-color)" strokeWidth="0.5" />
      ))}
      {NOTE_TYPES.map((n, i) => (
        <g key={n.kind}>
          <line x1={10 + i * laneW + 4} y1={lineY} x2={10 + (i + 1) * laneW - 4} y2={lineY} stroke={n.color} strokeWidth="2" opacity="0.5" />
          <text x={10 + i * laneW + laneW / 2} y="155" textAnchor="middle" fill={n.color} fontSize="9" fontWeight="bold">{n.kind.toUpperCase()}</text>
          <circle ref={el => { flashRefs.current[i] = el; }} cx={10 + i * laneW + laneW / 2} cy={lineY} r="3" fill="white" opacity="0" />
        </g>
      ))}
      <rect ref={holdBarRef} x={10 + 3 * laneW + laneW / 2 - 5} y={lineY} width="10" height="0" rx="2" fill="#4aff7a" opacity="0.4" />
      {NOTE_TYPES.map((n, i) => (
        <g key={n.kind} ref={el => { noteRefs.current[i] = el; }}>
          {n.kind === "tap" && <circle cx={10 + i * laneW + laneW / 2} cy={0} r="6" fill={n.color} />}
          {n.kind === "drag" && <rect x={10 + i * laneW + laneW / 2 - 6} y={-4} width="12" height="8" rx="2" fill={n.color} />}
          {n.kind === "flick" && <polygon points={`${10 + i * laneW + laneW / 2},${-6} ${10 + i * laneW + laneW / 2 - 7},${5} ${10 + i * laneW + laneW / 2 + 7},${5}`} fill={n.color} />}
          {n.kind === "hold" && <rect x={10 + i * laneW + laneW / 2 - 6} y={-4} width="12" height="8" rx="2" fill={n.color} />}
        </g>
      ))}
    </svg>
  );
}

// ---- Event Transition Demo (Events tab) ----

export function EventTransitionAnimation({ active }: { active: boolean }) {
  const lineRef = useRef<SVGGElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const [channel, setChannel] = useState<"x" | "y" | "rotation">("x");
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 3) / 3;
      const eased = easingFns.ease_in_out_cubic(t);
      let cx = 150, cy = 80, rot = 0;
      if (channel === "x") { cx = 60 + eased * 180; }
      else if (channel === "y") { cy = 30 + eased * 100; }
      else { rot = eased * 180; }

      if (lineRef.current) lineRef.current.setAttribute("transform", `translate(${cx}, ${cy}) rotate(${rot})`);
      if (dotRef.current) {
        dotRef.current.setAttribute("cx", String(20 + t * 260));
        dotRef.current.setAttribute("cy", String(140 - eased * 20));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, channel, timeRef]);

  const channels = [
    { id: "x" as const, color: "#ff6b6b", label: "X" },
    { id: "y" as const, color: "#51cf66", label: "Y" },
    { id: "rotation" as const, color: "#ffd43b", label: "Rotation" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, justifyContent: "center" }}>
        {channels.map(ch => (
          <button key={ch.id} onClick={() => setChannel(ch.id)} style={{
            padding: "3px 12px", borderRadius: 4, fontSize: 10, fontWeight: 600,
            border: `1px solid ${channel === ch.id ? ch.color : "var(--border-color)"}`,
            background: channel === ch.id ? ch.color + "22" : "transparent",
            color: channel === ch.id ? ch.color : "var(--text-muted)", cursor: "pointer",
          }}>{ch.label}</button>
        ))}
      </div>
      <svg width="100%" height="160" viewBox="0 0 300 160" style={{ display: "block", margin: "0 auto" }}>
        <rect x="10" y="10" width="280" height="120" fill="var(--bg-primary)" stroke="var(--border-color)" rx="4" />
        <g ref={lineRef}>
          <line x1="-30" y1="0" x2="30" y2="0" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="0" cy="0" r="2.5" fill="var(--accent-primary)" />
        </g>
        <line x1="20" y1="140" x2="280" y2="140" stroke="var(--border-color)" strokeWidth="0.5" />
        <circle ref={dotRef} cx="20" cy="140" r="3" fill={channels.find(c => c.id === channel)?.color ?? "#fff"} />
      </svg>
    </div>
  );
}

// ---- Constant vs Transition (Events tab) ----

export function ConstantVsTransition({ active }: { active: boolean }) {
  const constLineRef = useRef<SVGLineElement>(null);
  const transLineRef = useRef<SVGGElement>(null);
  const timeRef = useAnimationLoop(active);

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 2.5) / 2.5;
      const constX = t < 0.5 ? 40 : 100;
      if (constLineRef.current) constLineRef.current.setAttribute("x1", String(constX - 18));
      if (constLineRef.current) constLineRef.current.setAttribute("x2", String(constX + 18));

      const transT = Math.min(t / 0.8, 1);
      const eased = easingFns.ease_in_out_cubic(transT);
      const transX = 40 + eased * 60;
      if (transLineRef.current) transLineRef.current.setAttribute("transform", `translate(${transX}, 40)`);

      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, timeRef]);

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginBottom: 4, fontWeight: 600 }}>Constant</div>
        <svg width="100%" height="80" viewBox="0 0 140 80" style={{ display: "block" }}>
          <rect x="5" y="5" width="130" height="70" fill="var(--bg-primary)" stroke="var(--border-color)" rx="4" />
          <line ref={constLineRef} x1="22" y1="40" x2="58" y2="40" stroke="#cc5de8" strokeWidth="2.5" strokeLinecap="round" />
          <text x="70" y="70" textAnchor="middle" fill="var(--text-muted)" fontSize="7">Snaps instantly</text>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginBottom: 4, fontWeight: 600 }}>Transition</div>
        <svg width="100%" height="80" viewBox="0 0 140 80" style={{ display: "block" }}>
          <rect x="5" y="5" width="130" height="70" fill="var(--bg-primary)" stroke="var(--border-color)" rx="4" />
          <g ref={transLineRef}>
            <line x1="-18" y1="0" x2="18" y2="0" stroke="#51cf66" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="0" cy="0" r="2" fill="#51cf66" />
          </g>
          <text x="70" y="70" textAnchor="middle" fill="var(--text-muted)" fontSize="7">Slides smoothly</text>
        </svg>
      </div>
    </div>
  );
}

// ---- Easing Curve Explorer (Easings tab) ----

export function EasingExplorer({ active }: { active: boolean }) {
  const [selected, setSelected] = useState("ease_out_cubic");
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const barRef = useRef<SVGRectElement>(null);
  const timeRef = useAnimationLoop(active);

  const filteredEasings = familyFilter
    ? EASING_FAMILIES.find(f => f.name === familyFilter)?.easings ?? EASING_NAMES
    : EASING_NAMES;

  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      const t = (timeRef.current % 2) / 2;
      const fn = easingFns[selected] ?? easingFns.linear;
      const v = fn(t);

      const pad = 20, gw = 200, gh = 140;
      const dx = pad + t * gw;
      const dy = pad + gh - v * gh;
      if (dotRef.current) {
        dotRef.current.setAttribute("cx", String(dx));
        dotRef.current.setAttribute("cy", String(Math.max(pad - 15, Math.min(pad + gh + 15, dy))));
      }
      const barH = Math.max(0, Math.min(gh, v * gh));
      if (barRef.current) {
        barRef.current.setAttribute("y", String(pad + gh - barH));
        barRef.current.setAttribute("height", String(barH));
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active, selected, timeRef]);

  const fn = easingFns[selected] ?? easingFns.linear;
  const pad = 20, gw = 200, gh = 140;
  const pts: string[] = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    const v = fn(t);
    pts.push(`${pad + t * gw},${pad + gh - v * gh}`);
  }

  return (
    <div>
      {/* Family filter row */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 8 }}>
        <button onClick={() => setFamilyFilter(null)} style={{
          padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
          border: `1px solid ${!familyFilter ? "var(--accent-primary)" : "var(--border-color)"}`,
          background: !familyFilter ? "var(--accent-primary)22" : "transparent",
          color: !familyFilter ? "var(--accent-primary)" : "var(--text-muted)", cursor: "pointer",
        }}>All</button>
        {EASING_FAMILIES.map(f => (
          <button key={f.name} onClick={() => setFamilyFilter(f.name === familyFilter ? null : f.name)} style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 9,
            border: `1px solid ${familyFilter === f.name ? "var(--accent-primary)" : "var(--border-color)"}`,
            background: familyFilter === f.name ? "var(--accent-primary)22" : "transparent",
            color: familyFilter === f.name ? "var(--accent-primary)" : "var(--text-muted)", cursor: "pointer",
          }}>{f.name}</button>
        ))}
      </div>

      {/* Main explorer */}
      <div style={{ display: "flex", gap: 10 }}>
        <svg width="240" height="180" viewBox="0 0 240 180" style={{ flexShrink: 0 }}>
          <rect x={pad} y={pad} width={gw} height={gh} fill="var(--bg-primary)" stroke="var(--border-color)" rx="3" />
          <line x1={pad} y1={pad + gh} x2={pad + gw} y2={pad} stroke="#333" strokeWidth="0.5" strokeDasharray="2,2" />
          <polyline points={pts.join(" ")} fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinejoin="round" />
          <circle ref={dotRef} cx={pad} cy={pad + gh} r="4" fill="var(--accent-primary)" />
          <rect ref={barRef} x={pad + gw + 8} y={pad + gh} width="8" height="0" rx="2" fill="var(--accent-primary)" opacity="0.6" />
          <rect x={pad + gw + 8} y={pad} width="8" height={gh} rx="2" fill="none" stroke="var(--border-color)" strokeWidth="0.5" />
          <text x={pad + gw / 2} y={pad + gh + 16} textAnchor="middle" fill="var(--text-secondary)" fontSize="9" fontFamily="monospace">{selected}</text>
        </svg>

        <div style={{ flex: 1, padding: "4px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-primary)", marginBottom: 4 }}>{selected}</div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {selected.includes("in_out") ? "Slow start and slow end \u2014 smooth both ways." :
             selected.includes("_in_") || selected.startsWith("ease_in") ? "Slow start, fast end \u2014 builds momentum." :
             selected.includes("_out_") || selected.startsWith("ease_out") ? "Fast start, slow end \u2014 decelerates." :
             "Constant speed, no acceleration."}
            {selected.includes("back") && " Overshoots the target, then returns."}
            {selected.includes("elastic") && " Spring-like oscillation around the target."}
            {selected.includes("bounce") && " Bounces off the target value."}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 8 }}>
            Tip: <strong>In</strong> = slow start, <strong>Out</strong> = slow end, <strong>InOut</strong> = slow both
          </div>
        </div>
      </div>

      {/* Grid of all easings */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 4, marginTop: 10, maxHeight: 200, overflowY: "auto" }}>
        {filteredEasings.map(name => (
          <div key={name} onClick={() => setSelected(name)} style={{
            padding: 4, borderRadius: 6, cursor: "pointer", textAlign: "center",
            background: selected === name ? "var(--bg-active)" : "transparent",
            border: `1px solid ${selected === name ? "var(--accent-primary)" : "var(--border-color)"}`,
            transition: "border-color 0.15s",
          }}>
            <EasingMini name={name} size={48} />
            <div style={{ fontSize: 7, color: "var(--text-muted)", marginTop: 1, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.2 }}>
              {name.replace(/ease_/g, "").replace(/_/g, " ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
