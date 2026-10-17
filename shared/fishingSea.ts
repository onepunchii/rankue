/**
 * 오늘의 바다(2026-10-14) — 해역 일곱 곳에 지금 풍랑특보가 걸려 있는가. 낚시꾼이 나가기 전에 가장 먼저 묻는 것.
 *
 * 자료: 공공데이터포털 기상청_기상특보 조회서비스의 특보 현황(getPwnStatus) — t6(발효 중) · t7(예비특보) 글을 그대로 읽는다.
 * 다른 앱은 격자 색과 점수로 보여 준다. 우리는 **특보가 있는가 없는가를 말로** 적는다(점수 · 입질 확률은 만들지 않는다).
 *
 * ⚠️ "나가도 된다"고 말하지 않는다 — 특보가 없다는 사실만 적고, 출항은 해경 · 선장의 안내를 따르라고 적는다.
 * ⚠️ 특보 글의 꼴(o 풍랑주의보 : 해역, 해역(일부, 일부) …)이 바뀌면 여기가 틀린다 — 못 읽은 줄은 버리고, 한 줄도 못 읽으면 판을 내지 않는다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import type { TideSea } from "./fishingTide.js";

export type SeaCol = "west" | "south" | "east";
export interface SeaAreaDef { id: string; key: string; name: string; short: string; col: SeaCol; tide: TideSea; hint: string }
/** 기상청 해상 광역 일곱 곳(북한 쪽 서해북부 · 동해북부는 뺀다). hint 는 그 바다에 닿는 곳 */
export const SEA_AREAS: readonly SeaAreaDef[] = [
    { id: "west-mid", key: "서해중부", name: "서해중부", short: "중부", col: "west", tide: "west", hint: "인천 · 태안 · 보령" },
    { id: "west-south", key: "서해남부", name: "서해남부", short: "남부", col: "west", tide: "west", hint: "군산 · 부안 · 목포" },
    { id: "south-west", key: "남해서부", name: "남해서부", short: "서부", col: "south", tide: "south", hint: "완도 · 고흥 · 여수" },
    { id: "south-east", key: "남해동부", name: "남해동부", short: "동부", col: "south", tide: "south", hint: "통영 · 거제 · 부산" },
    { id: "jeju", key: "제주도", name: "제주", short: "제주", col: "south", tide: "south", hint: "제주 · 서귀포" },
    { id: "east-mid", key: "동해중부", name: "동해중부", short: "중부", col: "east", tide: "south", hint: "속초 · 강릉 · 삼척" },
    { id: "east-south", key: "동해남부", name: "동해남부", short: "남부", col: "east", tide: "south", hint: "울진 · 포항 · 울산" },
];
export const SEA_COLS: readonly { id: SeaCol; name: string }[] = [{ id: "west", name: "서해" }, { id: "south", name: "남해 · 제주" }, { id: "east", name: "동해" }];

/** 바다에 걸리는 특보의 갈래 — 강풍 · 호우 같은 뭍의 특보는 여기서 보지 않는다 */
const SEA_KINDS = ["풍랑", "태풍", "폭풍해일"] as const;

export interface PwnZone { name: string; parts: string[] }
export interface PwnLine { kind: string; level: "주의보" | "경보"; zones: PwnZone[] }
export interface PwnPre { kind: string; when: string; zones: PwnZone[] }

/** "가, 나(다, 라), 마" → 괄호 밖의 쉼표로만 가른다 */
export function splitZones(text: string): PwnZone[] {
    const out: PwnZone[] = [];
    let depth = 0, cur = "";
    const push = () => {
        const t = cur.trim(); cur = "";
        if (!t) return;
        const m = t.match(/^([^()]+)\((.*)\)$/);
        out.push(m ? { name: m[1].trim(), parts: m[2].split(",").map((s) => s.trim()).filter(Boolean) } : { name: t, parts: [] });
    };
    for (const ch of text) {
        if (ch === "(") depth++;
        if (ch === ")") depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) push(); else cur += ch;
    }
    push();
    return out;
}

/** 줄이 꺾여 온 글을 'o' 로 시작하는 줄 단위로 다시 묶는다 */
function items(text: string): string[] {
    const out: string[] = [];
    for (const raw of String(text ?? "").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (/^o\s/.test(line) || /^\(\d+\)/.test(line) || !out.length) out.push(line);
        else out[out.length - 1] += ` ${line}`;
    }
    return out;
}

/** 발효 중인 특보(t6) */
export function parsePwn(t6: string): PwnLine[] {
    const out: PwnLine[] = [];
    for (const line of items(t6)) {
        const m = line.match(/^o\s*(\S+?)(주의보|경보)\s*:\s*(.+)$/);
        if (m) out.push({ kind: m[1], level: m[2] as PwnLine["level"], zones: splitZones(m[3]) });
    }
    return out;
}

/** 읽을 수 있는 글인가 — 특보 줄이 하나라도 읽히거나, '없음'이라고 적혀 있어야 한다(꼴이 바뀐 글을 '특보 없음'으로 보이지 않게) */
export function seaReadable(t6: string | null | undefined): boolean {
    const text = String(t6 ?? "");
    return parsePwn(text).length > 0 || /^o\s*없음\s*$/m.test(text.replace(/\r/g, ""));
}

/** 예비특보(t7) — "(1) 풍랑 예비특보" 아래 "o 10월 14일 오전(06시~12시) : 해역 …" */
export function parsePre(t7: string): PwnPre[] {
    const out: PwnPre[] = [];
    let kind = "";
    for (const line of items(t7)) {
        const head = line.match(/^\(\d+\)\s*(\S+)\s*예비특보/);
        if (head) { kind = head[1]; continue; }
        const m = line.match(/^o\s*(.+?)\s*:\s*(.+)$/);
        if (m && kind) out.push({ kind, when: m[1].trim(), zones: splitZones(m[2]) });
    }
    return out;
}

export type SeaState = "clear" | "pre" | "far" | "warn" | "alert";
export interface SeaWarn { kind: string; level: "주의보" | "경보"; /** 앞바다의 일부에만 걸렸으면 그 이름들(전역이면 빈 배열) */ parts: string[] }
export interface SeaArea {
    id: string;
    state: SeaState;
    /** 앞바다에 걸린 특보(가장 센 것) */
    near: SeaWarn | null;
    /** 먼바다에 걸린 특보(가장 센 것) */
    far: SeaWarn | null;
    /** 앞바다에 올 예비특보(가장 이른 것) */
    pre: { kind: string; when: string } | null;
}

const partName = (s: string) => s.replace(/앞바다$/, "");
const stronger = (a: SeaWarn | null, b: SeaWarn): SeaWarn => {
    if (!a) return b;
    if (a.level !== b.level) return a.level === "경보" ? a : b;
    // 같은 세기면 넓은 쪽(전역)을 남긴다
    return a.parts.length === 0 ? a : b.parts.length === 0 ? b : { ...a, parts: [...new Set([...a.parts, ...b.parts])] };
};

/** 특보 글 두 덩이 → 해역 일곱 곳의 지금 */
export function seaBoard(t6: string, t7: string): SeaArea[] {
    const now = parsePwn(t6).filter((l) => (SEA_KINDS as readonly string[]).includes(l.kind));
    const pre = parsePre(t7).filter((l) => (SEA_KINDS as readonly string[]).includes(l.kind));
    return SEA_AREAS.map((a) => {
        let near: SeaWarn | null = null, far: SeaWarn | null = null, soon: SeaArea["pre"] = null;
        for (const l of now) for (const z of l.zones) {
            if (!z.name.startsWith(a.key)) continue;
            const w: SeaWarn = { kind: l.kind, level: l.level, parts: z.parts.map(partName) };
            if (z.name.includes("앞바다")) near = stronger(near, w);
            else if (z.name.includes("먼바다")) far = stronger(far, { ...w, parts: [] });
        }
        for (const l of pre) if (!soon && l.zones.some((z) => z.name.startsWith(a.key) && z.name.includes("앞바다"))) soon = { kind: l.kind, when: l.when };
        const state: SeaState = near ? (near.level === "경보" ? "alert" : "warn") : far ? "far" : soon ? "pre" : "clear";
        return { id: a.id, state, near, far, pre: near ? null : soon };
    });
}

/** 타일에 적는 짧은 말 */
export function seaWord(a: SeaArea): string {
    if (a.near) return `${a.near.kind}${a.near.level}`;
    if (a.far) return "먼바다만";
    if (a.pre) return "예비특보";
    return "특보 없음";
}

/** 고른 바다의 한 줄 */
export function seaHeadline(a: SeaArea): string {
    if (a.near) return `앞바다에 ${a.near.kind}${a.near.level}${a.near.parts.length ? "(일부)" : ""}`;
    if (a.far) return `앞바다는 특보 없음 · 먼바다 ${a.far.kind}${a.far.level}`;
    if (a.pre) return `지금은 특보 없음 · ${a.pre.kind} 예비특보`;
    return "지금 풍랑특보 없음";
}

/** 그 밑에 붙는 줄들 — 어디에 걸렸는지 · 먼바다 · 언제부터 */
export function seaNotes(a: SeaArea): string[] {
    const out: string[] = [];
    if (a.near?.parts.length) out.push(`${a.near.parts.slice(0, 4).join(" · ")}${a.near.parts.length > 4 ? ` 외 ${a.near.parts.length - 4}곳` : ""} 앞바다`);
    if (a.near && a.far) out.push(`먼바다도 ${a.far.kind}${a.far.level}`);
    if (a.pre) out.push(`${a.pre.when}부터 앞바다 ${a.pre.kind} 예비특보`);
    return out;
}

/** 발표 시각(202610140130) → "10월 14일 01:30" */
export function seaIssued(tmFc: string | number | null | undefined): string | null {
    const m = String(tmFc ?? "").match(/^\d{4}(\d{2})(\d{2})(\d{2})(\d{2})$/);
    return m ? `${Number(m[1])}월 ${Number(m[2])}일 ${m[3]}:${m[4]}` : null;
}

export interface SeaNow { areas: SeaArea[]; issued: string | null; /** 받아 온 지 오래됐으면(한 시간 넘게) true */ stale: boolean }
export const SEA_SOURCE = "기상청 기상특보";
export const SEA_CAUTION = "출항은 해경과 선장의 안내를 따르세요.";

/**
 * 지도 꼬리표 늘어놓기(2026-10-17 리뷰 — 남해서부의 꼬리표가 제주 꼬리표 밑에 깔려 보이지 않았다).
 * 센 특보부터, 같은 세기면 틀 끝에 밀려 자리가 묶인 것(제주 — 아래 끝)부터 놓는다. 자리의 값 = 원래 자리에서 떨어진 거리 + 덮는 글의 넓이:
 *   - 꼬리표끼리 · hard(지도 단추 · 특보 없는 구역의 이름)는 덮지 않는다
 *   - soft(지점 이름)는 되도록 피하되, 피하려고 다른 바다까지 튀느니 조금 덮는다(남해서부가 남해동부로 건너가던 것)
 * 위아래 한 칸 · 옆 1/4 폭씩 찾는다. 덮지 않을 자리가 없으면 가장 덜 겹치는 자리. 좌표 단위는 부른 쪽의 것(지도 칸).
 */
export interface TagBox { id: string; cx: number; cy: number; w: number; h: number; rank: number }
type Rect = { x0: number; y0: number; x1: number; y1: number };
export function layoutTags(tags: readonly TagBox[], bounds: Rect, gap: number, hard: readonly Rect[] = [], soft: readonly Rect[] = []): Map<string, { cx: number; cy: number }> {
    const out = new Map<string, { cx: number; cy: number }>();
    const placed: Rect[] = [...hard];
    const clampX = (t: TagBox, x: number) => Math.min(bounds.x1 - t.w / 2, Math.max(bounds.x0 + t.w / 2, x));
    const clampY = (t: TagBox, y: number) => Math.min(bounds.y1 - t.h / 2, Math.max(bounds.y0 + t.h / 2, y));
    const boxOf = (t: TagBox, cx: number, cy: number): Rect => ({ x0: cx - t.w / 2, y0: cy - t.h / 2, x1: cx + t.w / 2, y1: cy + t.h / 2 });
    const area = (b: Rect, list: readonly Rect[], g = 0) => list.reduce((n, p) => n + Math.max(0, Math.min(b.x1, p.x1 + g) - Math.max(b.x0, p.x0 - g)) * Math.max(0, Math.min(b.y1, p.y1 + g) - Math.max(b.y0, p.y0 - g)), 0);
    const inside = (b: Rect) => b.x0 >= bounds.x0 - 0.01 && b.x1 <= bounds.x1 + 0.01 && b.y0 >= bounds.y0 - 0.01 && b.y1 <= bounds.y1 + 0.01;
    const order = tags.map((t) => ({ t, x: clampX(t, t.cx), y: clampY(t, t.cy) }))
        .map((o) => ({ ...o, pinned: Math.abs(o.x - o.t.cx) + Math.abs(o.y - o.t.cy) }))
        .sort((a, b) => b.t.rank - a.t.rank || b.pinned - a.pinned);
    for (const { t, x, y } of order) {
        const sy = t.h + gap, sx = t.w / 4 + gap;
        const cands: [number, number][] = [];
        for (let i = -3; i <= 3; i++) for (let j = -4; j <= 4; j++) cands.push([x + j * sx, y + i * sy]);
        const ok = cands.filter(([cx, cy]) => inside(boxOf(t, cx, cy)));
        const cost = ([cx, cy]: [number, number]) => Math.hypot((cx - x) / t.h, ((cy - y) / t.h) * 1.6) + (area(boxOf(t, cx, cy), soft) / (t.w * t.h)) * 8;
        const free = ok.filter(([cx, cy]) => area(boxOf(t, cx, cy), placed, gap) === 0);
        const at = free.length
            ? free.reduce((best, c) => (cost(c) < cost(best) ? c : best))
            : ok.length ? ok.reduce((best, c) => (area(boxOf(t, c[0], c[1]), placed, gap) < area(boxOf(t, best[0], best[1]), placed, gap) ? c : best)) : [x, y] as [number, number];
        placed.push(boxOf(t, at[0], at[1]));
        out.set(t.id, { cx: at[0], cy: at[1] });
    }
    return out;
}
