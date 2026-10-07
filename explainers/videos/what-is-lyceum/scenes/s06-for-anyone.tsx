import React from "react";
import { Arrow, C, FONT, MONO_ADVANCE, Svg, prog, useScene, visibility } from "#kit";
import { ROLE, ScriptPage, type ScriptLine, useAppear } from "./shared";

// Precise, for anyone: four roles fan in, each with the tiny diagram it would explain; then the
// script's sources list, each source ticked, and one claim traced back to where it came from.

const CARD = { w: 380, h: 420, y: 470, xs: [285, 735, 1185, 1635] } as const;

/** Progress of the part of a draw-on that runs from `a` to `b` of the whole (0…1). */
const seg = (p: number, a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));

/** A stroke that draws on as `p` goes 0 → 1. */
const draw = (p: number): React.SVGProps<SVGPathElement> => ({
  pathLength: 1,
  strokeDasharray: 1,
  strokeDashoffset: 1 - p,
  fill: "none",
  opacity: p > 0 ? 1 : 0,
});

// The tiny diagrams, in card coordinates (380 × 420; the drawing area is roughly y 200–390).

const Services: React.FC<{ p: number }> = ({ p }) => {
  const boxes: [number, number, string][] = [
    [90, 255, ROLE.request],
    [290, 255, ROLE.cache],
    [190, 350, ROLE.database],
  ];
  const box = (x: number, y: number) => `M ${x - 44} ${y - 26} h 88 v 52 h -88 Z`;
  return (
    <>
      {boxes.map(([x, y, c], i) => {
        const q = seg(p, i * 0.15, i * 0.15 + 0.45);
        return (
          <g key={i}>
            <rect x={x - 44} y={y - 26} width={88} height={52} rx={8} fill={c} opacity={0.18 * seg(q, 0.6, 1)} />
            <path d={box(x, y)} stroke={c} strokeWidth={4} strokeLinejoin="round" {...draw(q)} />
          </g>
        );
      })}
      <path d="M 134 255 L 246 255" stroke={C.dim} strokeWidth={3} {...draw(seg(p, 0.55, 0.8))} />
      <path d="M 120 281 L 160 324" stroke={C.dim} strokeWidth={3} {...draw(seg(p, 0.65, 0.9))} />
      <path d="M 260 281 L 220 324" stroke={C.dim} strokeWidth={3} {...draw(seg(p, 0.75, 1))} />
    </>
  );
};

const Screens: React.FC<{ p: number }> = ({ p }) => {
  const xs = [70, 190, 310];
  const y = 300;
  return (
    <>
      {xs.map((x, i) => {
        const q = seg(p, i * 0.25, i * 0.25 + 0.4);
        return (
          <g key={i}>
            <path d={`M ${x - 32} ${y - 50} h 64 v 100 h -64 Z`} stroke={C.pink} strokeWidth={4} strokeLinejoin="round" {...draw(q)} />
            <path d={`M ${x - 20} ${y - 30} h 40`} stroke={C.pink} strokeWidth={3} {...draw(seg(q, 0.6, 1))} />
            <rect x={x - 20} y={y - 14} width={40} height={30} rx={4} fill={C.pink} opacity={0.25 * seg(q, 0.7, 1)} />
          </g>
        );
      })}
      {[0, 1].map((i) => {
        const q = seg(p, 0.35 + i * 0.25, 0.6 + i * 0.25);
        const x0 = xs[i] + 40;
        const x1 = xs[i + 1] - 40;
        return (
          <g key={`a${i}`}>
            <path d={`M ${x0} ${y} L ${x1} ${y}`} stroke={C.dim} strokeWidth={3} {...draw(q)} />
            <path d={`M ${x1 - 9} ${y - 7} L ${x1} ${y} L ${x1 - 9} ${y + 7}`} stroke={C.dim} strokeWidth={3} strokeLinejoin="round" {...draw(seg(q, 0.7, 1))} />
          </g>
        );
      })}
    </>
  );
};

const States: React.FC<{ p: number }> = ({ p }) => {
  const y = 300;
  const pill = (x: number, label: string, colour: string, q: number) => (
    <g>
      <path d={`M ${x - 24} ${y - 28} h 48 a 28 28 0 0 1 0 56 h -48 a 28 28 0 0 1 0 -56 Z`} stroke={colour} strokeWidth={4} {...draw(q)} />
      <text x={x} y={y + 9} textAnchor="middle" fontFamily={FONT.mono} fontSize={28} fill={colour} opacity={seg(q, 0.5, 1)}>
        {label}
      </text>
    </g>
  );
  const arrow = (d: string, head: string, q: number) => (
    <g>
      <path d={d} stroke={C.dim} strokeWidth={3} {...draw(q)} />
      <path d={head} stroke={C.dim} strokeWidth={3} strokeLinejoin="round" {...draw(seg(q, 0.7, 1))} />
    </g>
  );
  return (
    <>
      {pill(100, "off", C.dim, seg(p, 0, 0.35))}
      {pill(280, "on", C.green, seg(p, 0.15, 0.5))}
      {arrow("M 130 262 Q 190 222 250 262", "M 240 252 L 250 262 L 236 266", seg(p, 0.45, 0.75))}
      {arrow("M 250 338 Q 190 378 130 338", "M 140 348 L 130 338 L 144 334", seg(p, 0.65, 1))}
    </>
  );
};

const Timeline: React.FC<{ p: number }> = ({ p }) => {
  const y = 310;
  const ticks = [80, 160, 240, 320];
  return (
    <>
      <path d={`M 50 ${y} L 340 ${y}`} stroke={C.dim} strokeWidth={3} {...draw(seg(p, 0, 0.4))} />
      {ticks.map((x, i) => {
        const q = seg(p, 0.3 + i * 0.15, 0.55 + i * 0.15);
        const colour = i === 2 ? ROLE.wrong : C.text;
        return (
          <g key={i}>
            <path d={`M ${x} ${y - 22} L ${x} ${y + 22}`} stroke={colour} strokeWidth={i === 2 ? 5 : 4} {...draw(q)} />
            {i === 2 && <circle cx={x} cy={y - 44} r={9} fill={ROLE.wrong} opacity={seg(q, 0.5, 1)} />}
          </g>
        );
      })}
    </>
  );
};

const ROLES: { title: string; sub: string; cue: string; Diagram: React.FC<{ p: number }> }[] = [
  { title: "Engineer", sub: "how our services fit together", cue: "engineer", Diagram: Services },
  { title: "Designer", sub: "why this flow works", cue: "designer", Diagram: Screens },
  { title: "Product manager", sub: "how the feature behaves", cue: "product manager", Diagram: States },
  { title: "Everyone", sub: "a postmortem, in order", cue: "anyone", Diagram: Timeline },
];

/** A role card that fans in: rises and turns from a slight tilt to level, then draws its diagram. */
const RoleCard: React.FC<{ i: number; at: number; out: number }> = ({ i, at, out }) => {
  const { frame, fps } = useScene();
  if (frame < at) return null;
  const { title, sub, Diagram } = ROLES[i];
  const p = prog(frame, at, 0.7, fps);
  const o = p * visibility(frame, fps, undefined, out);
  if (o <= 0) return null;
  const tilt = (i % 2 === 0 ? -1 : 1) * 7;
  const dp = prog(frame, at + Math.round(0.35 * fps), 0.8, fps);
  return (
    <div
      style={{
        position: "absolute",
        left: CARD.xs[i] - CARD.w / 2,
        top: CARD.y - CARD.h / 2,
        width: CARD.w,
        height: CARD.h,
        borderRadius: 18,
        border: `2px solid ${C.faint}`,
        background: "#16161A",
        opacity: o,
        transform: `translateY(${(1 - p) * 70}px) rotate(${(1 - p) * tilt}deg)`,
        transformOrigin: "50% 100%",
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: 36, textAlign: "center", fontFamily: FONT.serif, fontSize: 40, color: C.text }}>
        {title}
      </div>
      <div
        style={{
          position: "absolute",
          left: 30,
          right: 30,
          top: 96,
          textAlign: "center",
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 28,
          lineHeight: "36px",
          color: C.dim,
        }}
      >
        {sub}
      </div>
      <svg width={CARD.w} height={CARD.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <Diagram p={dp} />
      </svg>
    </div>
  );
};

// The script's frontmatter (illustrative).
const LINES: ScriptLine[] = [
  { text: "---", kind: "meta" },
  { text: 'title: "How our cache works"', kind: "narration" },
  { text: "sources:", kind: "narration" },
  { text: "  - services/cache/README.md", kind: "visual" },
  { text: "  - services/cache/store.ts", kind: "visual" },
  { text: "  - docs/decisions/cache-expiry.md", kind: "visual" },
  { text: "  - incident review, March 3", kind: "visual" },
  { text: "---", kind: "meta" },
];
const PAGE = { x: 160, y: 200, w: 1000, h: 520, size: 28 } as const;
const SOURCES = [3, 4, 5, 6];
/** Where a page line's text ends, and its vertical centre (matches ScriptPage's layout). */
function lineEnd(i: number): [number, number] {
  const lh = PAGE.size * 1.6;
  const x = PAGE.x + 28 + LINES[i].text.length * PAGE.size * MONO_ADVANCE;
  const y = PAGE.y + 54 + 28 + i * lh + lh / 2;
  return [x, y];
}

export const ForAnyone: React.FC = () => {
  const { frame, fps, cue } = useScene();

  const ats = ROLES.map((r) => cue(r.cue));
  const because = cue("Because the agent");
  const says = cue("says what's true");
  const where = cue("where every claim");
  const cameFrom = cue("came from");

  // The page slides in from the left as the cards leave.
  const pageAt = because + Math.round(0.35 * fps);
  const slide = prog(frame, pageAt, 0.8, fps);
  const captionO = useAppear(pageAt + Math.round(0.8 * fps));

  // Checks tick on one per source, the last landing by "came from".
  const first = says + Math.round(0.4 * fps);
  const step = (cameFrom - Math.round(0.35 * fps) - first) / (SOURCES.length - 1);
  const checkAts = SOURCES.map((_, k) => Math.round(first + k * step));

  // The claim, traced to the source it came from.
  const claimO = useAppear(where, undefined, 0.6);
  const target = lineEnd(5);
  const claimY = target[1];

  return (
    <>
      {ROLES.map((_, i) => (
        <RoleCard key={i} i={i} at={ats[i]} out={because} />
      ))}

      {frame >= pageAt && (
        <div style={{ position: "absolute", inset: 0, transform: `translateX(${(1 - slide) * -80}px)` }}>
          <ScriptPage
            x={PAGE.x}
            y={PAGE.y}
            w={PAGE.w}
            h={PAGE.h}
            size={PAGE.size}
            title="script.md"
            lines={LINES}
            at={pageAt}
            highlight={[{ lines: SOURCES, at: says, color: ROLE.agent }]}
          />
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: PAGE.x,
          top: PAGE.y + PAGE.h + 18,
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 26,
          color: C.dim,
          opacity: captionO,
        }}
      >
        illustrative
      </div>

      <Svg>
        {SOURCES.map((line, k) => {
          const q = prog(frame, checkAts[k], 0.35, fps);
          if (frame < checkAts[k]) return null;
          const [x, y] = lineEnd(line);
          const cx = x + 40;
          return (
            <path
              key={line}
              d={`M ${cx - 12} ${y + 1} L ${cx - 3} ${y + 11} L ${cx + 15} ${y - 12}`}
              stroke={ROLE.agent}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...draw(q)}
            />
          );
        })}
        {frame >= where && (
          <Arrow
            from={[1250, claimY]}
            to={[target[0] + 80, claimY]}
            bend={-40}
            at={where + Math.round(0.35 * fps)}
            dur={0.6}
            color={ROLE.agent}
            width={3}
          />
        )}
      </Svg>

      <div
        style={{
          position: "absolute",
          left: 1270,
          top: claimY - 70,
          width: 530,
          height: 140,
          borderRadius: 14,
          border: `2px solid ${ROLE.agent}88`,
          background: `${ROLE.agent}14`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 30px",
          fontFamily: FONT.serif,
          fontSize: 32,
          lineHeight: "42px",
          color: C.text,
          opacity: claimO,
          transform: `translateX(${(1 - claimO) * 30}px)`,
        }}
      >
        entries expire after five minutes
      </div>
      <div
        style={{
          position: "absolute",
          left: 1270,
          top: claimY - 118,
          fontFamily: FONT.serif,
          fontStyle: "italic",
          fontSize: 26,
          color: C.dim,
          opacity: claimO,
        }}
      >
        a claim in the video
      </div>
    </>
  );
};
