/**
 * 쇼츠 1단계 — 샷 하나의 사실(facts.json)과 재생 입력(shot.json)을 만든다. DB는 읽기만 한다.
 *
 *   npx tsx scripts/shorts/facts.ts <matchId> <shotIdx> [slug]
 *
 *  - shot.json: preState · input · 시뮬 파라미터 — 렌더 페이지가 이것만으로 같은 샷을 다시 시뮬한다(해시로 확인).
 *  - facts.json: 대본을 쓰는 LLM에 넘길 사실. 큐볼 쿠션 시각, 적구 접촉 시각, 경기 상황, 기적 지수.
 *  - 기적 지수: 같은 자리에서 사람 손 떨림 수준의 오차(각도 σ0.1°, 세기 σ2%, 당점 σ0.02R)로 1,000번 다시 쳐서 득점 수를 센다.
 *    시드가 고정이라 매번 같은 숫자가 나온다.
 *  - 회원 이름은 넣지 않는다(공개 동의 전). "플레이어 A/B"로만 부른다.
 */
import pg from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { simulateShot } from "@shared/sim/simulate";
import { TABLES, DEFAULT_CUE, type SimParams } from "@shared/sim/params";
import { evaluateShot, DEFAULT_3C_RULES, DEFAULT_4C_RULES } from "@shared/sim/rules/evaluate";
import type { Rules } from "@shared/sim/rules/types";
import type { ShotInput } from "@shared/sim/types";
import { mulberry32 } from "@shared/sim/rng";
import { V0_MAX } from "@shared/sim/shotLimits";

const [matchId, idxArg, slugArg] = process.argv.slice(2);
if (!matchId || !idxArg) throw new Error("사용법: tsx scripts/shorts/facts.ts <matchId> <shotIdx> [slug]");
const idx = Number(idxArg);
const slug = slugArg ?? `${matchId.slice(0, 8)}-${idx}`;
const outDir = `scripts/shorts/out/${slug}`;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query("SET default_transaction_read_only = on");
const m = (await db.query(
    `select id, game_type, table_id, cushion_model, condition, rules, host_target, guest_target, inning_cap from hiq_sim_matches where id = $1`, [matchId])).rows[0];
if (!m) throw new Error(`경기 없음: ${matchId}`);
const shots = (await db.query(
    `select idx, player_index, pre_state, input, hash, outcome_code, points, cushions, inning, created_at from hiq_sim_match_shots where match_id = $1 and idx <= $2 order by idx`,
    [matchId, idx])).rows;
await db.end();
const shot = shots.at(-1);
if (!shot || shot.idx !== idx) throw new Error(`샷 없음: ${matchId} #${idx}`);

const params: SimParams = { table: TABLES[m.table_id as keyof typeof TABLES], cue: DEFAULT_CUE, cushionModel: m.cushion_model, condition: m.condition };
const rules: Rules = { ...(m.game_type === "3c" ? DEFAULT_3C_RULES : DEFAULT_4C_RULES), ...(m.rules ?? {}) } as Rules;
const input = shot.input as ShotInput;
const res = simulateShot(shot.pre_state, input, params);
if (res.hash !== shot.hash) throw new Error("재시뮬 해시가 기록과 다르다 — 엔진 버전을 확인할 것");
const outcome = evaluateShot(res.events, input.cueBallId, rules);

// 큐볼 쿠션 · 적구 접촉 타임라인(두 번째 적구를 맞힐 때까지가 3쿠션 판정에 쓰이는 구간)
const cue = input.cueBallId;
const timeline: { t: number; kind: "cushion" | "contact"; n?: number; ball?: string; cushion?: string }[] = [];
let contacts = 0, cushionN = 0;
for (const e of res.events) {
    if (contacts >= 2) break;
    if (e.type === "ball-cushion" && e.ids[0] === cue) timeline.push({ t: e.t, kind: "cushion", n: ++cushionN, cushion: e.cushion });
    if (e.type === "ball-ball" && e.ids.includes(cue)) {
        const other = e.ids[0] === cue ? e.ids[1] : e.ids[0];
        contacts++;
        timeline.push({ t: e.t, kind: "contact", n: contacts, ball: other });
    }
}

// 기적 지수
const rnd = mulberry32(20261028);
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const TRIALS = 1000;
let hits = 0;
let hitMask = ""; // 시도별 성공 여부(1/0)
// 시도별 입력 [phi, V0, a, b] — 렌더 페이지가 다시 시뮬해 1,000개 궤적을 그린다(trials.json, 대본 LLM 에는 안 넘긴다)
const trialInputs: [number, number, number, number][] = [];
const t0 = Date.now();
for (let i = 0; i < TRIALS; i++) {
    const jittered: ShotInput = {
        ...input,
        phi: input.phi + gauss() * (0.1 * Math.PI / 180),
        V0: Math.min(V0_MAX, Math.max(0.1, input.V0 * (1 + gauss() * 0.02))),
        a: Math.max(-params.cue.maxOffset, Math.min(params.cue.maxOffset, input.a + gauss() * 0.02)),
        b: Math.max(-params.cue.maxOffset, Math.min(params.cue.maxOffset, input.b + gauss() * 0.02)),
    };
    trialInputs.push([jittered.phi, jittered.V0, jittered.a, jittered.b]);
    try {
        const r = simulateShot(shot.pre_state, jittered, params);
        const ok = evaluateShot(r.events, cue, rules, r.truncated).points > 0;
        if (ok) hits++;
        hitMask += ok ? "1" : "0";
    } catch { hitMask += "0"; /* 범위 밖 입력은 실패로 센다 */ }
}

// 경기 상황(이 샷 직전 점수)
const score = [0, 0];
for (const s of shots.slice(0, -1)) score[s.player_index] += s.points;
const shooter = shot.player_index;
let run = 0; // 이 샷 직전까지 같은 선수의 연속 득점
for (const s of shots.slice(0, -1).reverse()) { if (s.player_index !== shooter || s.points <= 0) break; run++; }

// 언제 친 샷인가(한국 시간) — 화면 스코어보드에 "10.27 (월) 밤 11:42" 처럼 쓴다
const kst = new Date(new Date(shot.created_at).getTime() + 9 * 3600_000);
const hh = kst.getUTCHours();
const period = hh < 6 ? "새벽" : hh < 12 ? "오전" : hh < 18 ? "오후" : "밤";
const when = {
    iso: new Date(shot.created_at).toISOString(),
    label: `${kst.getUTCMonth() + 1}.${kst.getUTCDate()} (${"일월화수목금토"[kst.getUTCDay()]}) ${period} ${((hh + 11) % 12) + 1}:${String(kst.getUTCMinutes()).padStart(2, "0")}`,
};

const deg = (r: number) => Math.round(r * 180 / Math.PI * 10) / 10;
const facts = {
    slug,
    when,
    game: { type: m.game_type, table: params.table.name, tableId: m.table_id, rules: (rules as any).ruleSet ?? null },
    players: { shooter: shooter === 0 ? "플레이어 A" : "플레이어 B", other: shooter === 0 ? "플레이어 B" : "플레이어 A" },
    situation: {
        shotNumber: idx + 1, inning: shot.inning, scoreBefore: { shooter: score[shooter], other: score[1 - shooter] },
        target: shooter === 0 ? m.host_target : (m.guest_target ?? m.host_target), runBefore: run,
    },
    shot: {
        outcome: outcome.code, points: outcome.points, cushionsBeforeSecond: timeline.filter((x) => x.kind === "cushion").length,
        duration: Math.round(res.duration * 100) / 100,
        cuePowerPct: Math.round(input.V0 / V0_MAX * 100), aimDeg: deg(input.phi),
        tipSide: Math.round(input.a * 100) / 100, tipHeight: Math.round(input.b * 100) / 100, cueElevationDeg: deg(input.theta ?? 0),
    },
    timeline: timeline.map((x) => ({ ...x, t: Math.round(x.t * 1000) / 1000 })),
    miracle: { trials: TRIALS, hits, hitMask, noise: "각도 σ0.1°, 세기 σ2%, 당점 σ0.02R", ms: Date.now() - t0 },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/shot.json`, JSON.stringify({ preState: shot.pre_state, input, params, hash: shot.hash, gameType: m.game_type }, null, 1));
writeFileSync(`${outDir}/facts.json`, JSON.stringify(facts, null, 2));
writeFileSync(`${outDir}/trials.json`, JSON.stringify(trialInputs));
console.log(JSON.stringify({ ...facts, miracle: { ...facts.miracle, hitMask: `${hitMask.length}개` } }, null, 2));
