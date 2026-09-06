/**
 * compare.ts — ours.json(shared/sim) 과 pooltool.json(오라클)을 샷별로 대조한다.
 *
 * 보고 항목
 *   - 샷별 최종 위치 오차(모든 공 중 최대, m), 중앙값·평균·최대
 *   - 이벤트 "종류" 열(ball-ball / ball-cushion / transition 순서만)이 같은 샷 비율
 *   - 이벤트 "엄격" 열(종류 + id + 쿠션/전이 상태)이 같은 샷 비율, 첫 불일치 위치와 그때의 두 토큰
 *   - 타격 직후 상태 오차 (|Δv|, R|Δω|) — 스틱–볼 정렬 검증
 *   - 서브모델 진단: 엄격 열이 일치하는 구간을 따라 이벤트 직후 상태 오차를 추적해, 오차가 처음 "크게" 뛴 이벤트의
 *     종류(볼–볼 / 쿠션 / 전이)를 센다. 어느 서브모델에서 두 엔진이 갈리는지 보여준다.
 *
 * 실행: cd scripts/sim-oracle && npx tsx compare.ts [--out out] [--top 10]
 * 출력: 표준출력 요약 + out/compare.json (샷별 상세)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventOut, ShotOut, StateOut } from "./export";

const HERE = dirname(fileURLToPath(import.meta.url));

interface File { meta: Record<string, unknown> & { ball: { R: number } }; shots: ShotOut[] }

function arg(name: string, fallback: string): string {
    const idx = process.argv.indexOf(name);
    return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : fallback;
}

function token(e: EventOut): string {
    if (e.type === "ball-ball") return `BB(${e.ids.join(",")})`;
    if (e.type === "ball-cushion") return `BC(${e.ids[0]}:${e.cushion})`;
    return `TR(${e.ids[0]}:${e.from}>${e.to})`;
}

function dist2(a: readonly number[], b: readonly number[]): number {
    const dx = a[0] - b[0], dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function norm3(a: readonly number[], b: readonly number[]): number {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

interface StateErr { r: number; v: number; w: number }

function stateErr(a: Record<string, StateOut>, b: Record<string, StateOut>, R: number): StateErr {
    let r = 0, v = 0, w = 0;
    for (const id of Object.keys(a)) {
        if (!b[id]) continue;
        r = Math.max(r, norm3(a[id].r, b[id].r));
        v = Math.max(v, norm3(a[id].v, b[id].v));
        w = Math.max(w, R * norm3(a[id].w, b[id].w));
    }
    return { r, v, w };
}

function median(xs: number[]): number {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}

function fmt(x: number, digits = 3): string {
    if (!Number.isFinite(x)) return String(x);
    if (x === 0) return "0";
    return x.toExponential(digits);
}

function mm(x: number): string {
    return (x * 1000).toFixed(3) + " mm";
}

interface ShotReport {
    i: number;
    gameType: string;
    layout: string;
    V0: number;
    a: number;
    b: number;
    finalErr: number;
    finalErrBall: string;
    nEventsOurs: number;
    nEventsPt: number;
    durationOurs: number;
    durationPt: number;
    typeSeqEqual: boolean;
    strictSeqEqual: boolean;
    firstDivergence: number;
    divergeOurs: string | null;
    divergePt: string | null;
    divergeDt: number | null;
    strikeErr: StateErr;
    /** 엄격 열이 일치하는 구간에서 이벤트 직후 상태 오차 (r, v, Rω) 와 이벤트 시각 차 (ours − pooltool). */
    trace: { k: number; token: string; t: number; dt: number; err: StateErr }[];
    /** 오차가 처음 임계값을 넘은 이벤트 (없으면 null). */
    firstJump: { k: number; token: string; type: string; before: StateErr; after: StateErr } | null;
    /** 갈라지기 직전의 오차. */
    errBeforeDivergence: StateErr | null;
    truncatedOurs: boolean;
    truncatedPt: boolean;
}

const JUMP_R = 1e-6;   // m
const JUMP_V = 1e-6;   // m/s

function analyze(o: ShotOut, p: ShotOut, R: number): ShotReport {
    let finalErr = 0, finalErrBall = "";
    for (const id of Object.keys(o.final)) {
        const d = dist2(o.final[id], p.final[id]);
        if (d > finalErr) { finalErr = d; finalErrBall = id; }
    }
    const to = o.events.map((e) => e.type), tp = p.events.map((e) => e.type);
    const typeSeqEqual = to.length === tp.length && to.every((x, k) => x === tp[k]);
    const so = o.events.map(token), sp = p.events.map(token);
    let firstDivergence = -1;
    const n = Math.min(so.length, sp.length);
    for (let k = 0; k < n; k++) if (so[k] !== sp[k]) { firstDivergence = k; break; }
    if (firstDivergence < 0 && so.length !== sp.length) firstDivergence = n;
    const strictSeqEqual = firstDivergence < 0;

    const strikeErr = stateErr(o.afterStrike, p.afterStrike, R);
    const trace: ShotReport["trace"] = [];
    let firstJump: ShotReport["firstJump"] = null;
    let prev: StateErr = strikeErr;
    const upto = strictSeqEqual ? so.length : firstDivergence;
    for (let k = 0; k < upto; k++) {
        const err = stateErr(o.events[k].after, p.events[k].after, R);
        trace.push({ k, token: so[k], t: o.events[k].t, dt: o.events[k].t - p.events[k].t, err });
        if (firstJump === null && (err.r > JUMP_R || err.v > JUMP_V) && !(prev.r > JUMP_R || prev.v > JUMP_V)) {
            firstJump = { k, token: so[k], type: o.events[k].type, before: prev, after: err };
        }
        prev = err;
    }
    return {
        i: o.i,
        gameType: o.gameType,
        layout: o.layout,
        V0: o.input.V0,
        a: o.input.a,
        b: o.input.b,
        finalErr,
        finalErrBall,
        nEventsOurs: o.events.length,
        nEventsPt: p.events.length,
        durationOurs: o.duration,
        durationPt: p.duration,
        typeSeqEqual,
        strictSeqEqual,
        firstDivergence,
        divergeOurs: firstDivergence >= 0 ? (so[firstDivergence] ?? "(end)") : null,
        divergePt: firstDivergence >= 0 ? (sp[firstDivergence] ?? "(end)") : null,
        divergeDt: firstDivergence >= 0 && o.events[firstDivergence] && p.events[firstDivergence]
            ? o.events[firstDivergence].t - p.events[firstDivergence].t : null,
        strikeErr,
        trace,
        firstJump,
        errBeforeDivergence: firstDivergence > 0 ? trace[firstDivergence - 1].err : (firstDivergence === 0 ? strikeErr : null),
        truncatedOurs: o.truncated,
        truncatedPt: p.truncated,
    };
}

function main(): void {
    const outDir = join(HERE, arg("--out", "out"));
    const top = Number(arg("--top", "10"));
    const ptName = arg("--pt", "pooltool.json");
    const tag = ptName.replace(/\.json$/, "");
    const ours = JSON.parse(readFileSync(join(outDir, "ours.json"), "utf8")) as File;
    const pt = JSON.parse(readFileSync(join(outDir, ptName), "utf8")) as File;
    const R = ours.meta.ball.R;
    const byI = new Map(pt.shots.map((s) => [s.i, s]));

    const reports: ShotReport[] = [];
    for (const o of ours.shots) {
        const p = byI.get(o.i);
        if (!p) { console.warn(`shot ${o.i} missing in pooltool.json`); continue; }
        reports.push(analyze(o, p, R));
    }

    const errs = reports.map((r) => r.finalErr);
    const nType = reports.filter((r) => r.typeSeqEqual).length;
    const nStrict = reports.filter((r) => r.strictSeqEqual).length;
    const over5 = reports.filter((r) => r.finalErr > 5e-3).length;
    const over1 = reports.filter((r) => r.finalErr > 1e-3).length;
    const under1um = reports.filter((r) => r.finalErr < 1e-6).length;
    const strikeMax = Math.max(...reports.map((r) => Math.max(r.strikeErr.v, r.strikeErr.w)));

    const jumpBy: Record<string, number> = {};
    const jumpR: Record<string, number[]> = {};
    const jumpV: Record<string, number[]> = {};
    for (const r of reports) {
        if (!r.firstJump) continue;
        const t = r.firstJump.type;
        jumpBy[t] = (jumpBy[t] ?? 0) + 1;
        (jumpR[t] ??= []).push(r.firstJump.after.r);
        (jumpV[t] ??= []).push(r.firstJump.after.v);
    }
    const jumpStats = Object.keys(jumpBy).map((t) => `${t}: n=${jumpBy[t]}, median Δr ${fmt(median(jumpR[t]), 2)} m, median Δv ${fmt(median(jumpV[t]), 2)} m/s`).join("; ");
    const divBy: Record<string, number> = {};
    for (const r of reports) {
        if (r.strictSeqEqual) continue;
        const key = `${r.divergeOurs?.slice(0, 2)} vs ${r.divergePt?.slice(0, 2)}`;
        divBy[key] = (divBy[key] ?? 0) + 1;
    }

    const lines: string[] = [];
    const oracle = (pt.meta as { oracle?: { pooltool?: string; minDist?: number } }).oracle;
    lines.push(`# shared/sim ${String(ours.meta.engineVersion)} vs pooltool ${String(oracle?.pooltool)} (MIN_DIST=${String(oracle?.minDist)}) — ${reports.length} shots (DAEDAE, han2005, theta=0) [${ptName}]`);
    lines.push("");
    lines.push(`final position error (max over balls, per shot):`);
    lines.push(`  median ${mm(median(errs))}   mean ${mm(errs.reduce((a, b) => a + b, 0) / errs.length)}   max ${mm(Math.max(...errs))}   min ${fmt(Math.min(...errs))} m`);
    lines.push(`  shots < 1 µm: ${under1um}/${reports.length}   > 1 mm: ${over1}   > 5 mm: ${over5}`);
    lines.push(`event TYPE sequence identical:   ${nType}/${reports.length} (${(100 * nType / reports.length).toFixed(1)}%)`);
    lines.push(`event STRICT sequence identical: ${nStrict}/${reports.length} (${(100 * nStrict / reports.length).toFixed(1)}%)`);
    lines.push(`post-strike max error (|Δv| or R|Δω|): ${fmt(strikeMax)} — stick-ball alignment`);
    lines.push(`first error jump (>1e-6) by event type: ${JSON.stringify(jumpBy)}   (shots with no jump: ${reports.filter((r) => !r.firstJump).length})`);
    lines.push(`  at the first jump — ${jumpStats}`);
    lines.push(`first strict divergence (ours vs pooltool token kind): ${JSON.stringify(divBy)}`);
    lines.push("");
    lines.push("| i | game | layout | V0 | a | b | ev ours/pt | final err | type seq | strict | 1st div @ | ours | pooltool | Δt @div | err before div (r / v) | 1st jump |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    const sorted = [...reports].sort((a, b) => b.finalErr - a.finalErr);
    for (const r of sorted) {
        const eb = r.errBeforeDivergence;
        lines.push(`| ${r.i} | ${r.gameType} | ${r.layout} | ${r.V0.toFixed(2)} | ${r.a.toFixed(2)} | ${r.b.toFixed(2)} | ${r.nEventsOurs}/${r.nEventsPt} | ${mm(r.finalErr)} | ${r.typeSeqEqual ? "✓" : "✗"} | ${r.strictSeqEqual ? "✓" : "✗"} | ${r.firstDivergence >= 0 ? r.firstDivergence : "-"} | ${r.divergeOurs ?? "-"} | ${r.divergePt ?? "-"} | ${r.divergeDt === null ? "-" : fmt(r.divergeDt, 2)} | ${eb ? `${fmt(eb.r, 1)} / ${fmt(eb.v, 1)}` : "-"} | ${r.firstJump ? `${r.firstJump.token}@${r.firstJump.k}` : "-"} |`);
    }
    lines.push("");
    lines.push(`## worst ${top} shots — error trace along the matching prefix`);
    for (const r of sorted.slice(0, top)) {
        lines.push(`### shot ${r.i} (${r.gameType}/${r.layout}, V0=${r.V0.toFixed(2)}, a=${r.a.toFixed(2)}, b=${r.b.toFixed(2)}) final err ${mm(r.finalErr)} on ${r.finalErrBall}; duration ours ${r.durationOurs.toFixed(4)} pt ${r.durationPt.toFixed(4)}`);
        lines.push(`  strike: Δv ${fmt(r.strikeErr.v)} RΔω ${fmt(r.strikeErr.w)}`);
        for (const t of r.trace) lines.push(`  [${t.k}] t=${t.t.toFixed(5)} (Δt ${fmt(t.dt, 1)}) ${t.token.padEnd(34)} Δr ${fmt(t.err.r, 2)} Δv ${fmt(t.err.v, 2)} RΔω ${fmt(t.err.w, 2)}`);
        if (!r.strictSeqEqual) lines.push(`  DIVERGE @${r.firstDivergence}: ours ${r.divergeOurs}  pooltool ${r.divergePt}  Δt ${r.divergeDt === null ? "-" : fmt(r.divergeDt, 3)}`);
    }
    const text = lines.join("\n");
    console.log(text);
    writeFileSync(join(outDir, `compare-${tag}.md`), text + "\n");
    writeFileSync(join(outDir, `compare-${tag}.json`), JSON.stringify({
        summary: {
            shots: reports.length,
            medianFinalErr: median(errs),
            meanFinalErr: errs.reduce((a, b) => a + b, 0) / errs.length,
            maxFinalErr: Math.max(...errs),
            typeSeqIdentical: nType,
            strictSeqIdentical: nStrict,
            over1mm: over1,
            over5mm: over5,
            strikeMaxErr: strikeMax,
            firstJumpByType: jumpBy,
            divergenceKinds: divBy,
        },
        shots: reports,
    }, null, 1));
}

main();
