/**
 * 스코어카드 스캔(2026-10-13 오너: "골프 랭큐 매치에 스코어카드 스캔 로직을 어떻게 설계할까?") — 카드 그림을 점수판의 **초안**으로 바꾸는 계산.
 *
 * 받는 것은 **앱이 만든 디지털 스코어카드**(스마트스코어 꼴)뿐이다 — 오너: "이런 형태만 받으려고 해. 수기는 의미가 없고 인식률도 떨어지고."
 * 이 꼴의 카드는: 아홉 홀씩 두 판(코스 이름 · 1~9 · TOTAL) · PAR 줄 · 사람 줄. 칸은 **파를 0 으로 둔 표기**(0 · 1 · 2 · −1)이고
 * TOTAL 은 타수(둘째 판에는 18홀 합이 하나 더 붙는다). 버디 칸에는 새 그림이 얹혀 − 를 가리기도 한다. 위에는 날짜가 찍혀 있다.
 *
 * 나눠 맡는다:
 *  - 모델은 **받아쓰기만** 한다 — 칸에 적힌 그대로와 인쇄된 합을 따로 옮긴다(ScanRead). 못 읽은 칸은 null.
 *  - 타수로 바꾸기 · 합계 맞춰 보기 · 범위 검사는 전부 **이 파일의 코드**가 한다. 합계까지 모델에 맡기면 홀 점수를 합계에 맞춰
 *    고쳐 버릴 수 있다 — 그러면 검산이 뜻을 잃는다(reports/골프 스코어카드 OCR 모델 비교.md).
 *  - 칸의 상태는 모델이 스스로 매긴 신뢰도가 아니라 **인쇄된 합과의 대조**에서 만든다: 확정(ok) · 확인 필요(check) · 빈칸(empty).
 *
 * 여기서 나온 것은 아무것도 저장하지 않는다 — 방장이 확인 화면에서 고치고 '점수판에 넣기'를 누르면 지금의 점수 저장 길
 * (POST /match/:id/score)로만 들어간다. 스캔 결과로 공용 파 자료를 고치지 않는다: 카드의 파와 방의 파가 다르면 '코스를 잘못 골랐다'는 신호로만 쓴다.
 * 스캔했다고 공식 라운드가 되지도 않는다(현장 인증 규칙은 그대로 — shared/golfOnSite).
 *
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { HOLES, isValidStroke } from "./golfMatch.js";

/**
 * 하루 횟수 제한은 두지 않는다(2026-10-13 오너: "스코어카드 제한 풀 거야 — 내가 한도 걸 때 그때 하자").
 * 걸 때는 env GOLF_SCAN_DAILY_LIMIT(한 사람 · 한국 날짜 기준 횟수)만 넣으면 된다 — 한 번에 5원쯤 든다.
 */
export function scanDailyLimit(raw: string | undefined | null): number | null {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}
/** 보내기 전에 기기에서 줄이는 긴 변(px) · 받는 쪽의 상한(data URL 글자 수) */
export const SCAN_MAX_EDGE = 1600;
export const SCAN_MAX_CHARS = 2_400_000;
/** 한 카드에서 읽는 줄 수 — 한 조는 넷까지 */
export const SCAN_MAX_ROWS = 4;

/** 그림의 종류 — app: 앱이 만든 디지털 카드(받는 것) · handwritten: 손으로 적은 카드 · other: 스코어카드가 아님 */
export type ScanCardKind = "app" | "handwritten" | "other";

/** 모델이 옮겨 적은 한 줄 — 전부 '적힌 그대로'의 글자 */
export interface ScanReadRow {
    /** 줄 맨 앞에 적힌 것(이름) — 줄과 참가자를 잇는 데만 쓰고 저장하지 않는다 */
    label: string | null;
    /** 홀 1~18 의 칸 */
    cells: (string | null)[];
    /** 앞 아홉 홀의 합 · 뒤 아홉 홀의 합 · 18홀의 합 */
    out: string | null;
    in: string | null;
    total: string | null;
}
export interface ScanRead {
    kind: ScanCardKind;
    /** 카드에 찍힌 날짜(적힌 그대로) */
    date: string | null;
    /** 골프장 이름 — 적힌 그대로 · 한글로 옮긴 것(로고가 영문인 카드가 많다 — 우리 명부와 맞춰 볼 때만 쓴다) */
    club?: string | null;
    clubKo?: string | null;
    /** 전반 · 후반 판의 코스 이름 — 적힌 그대로 · 한글로 옮긴 것 */
    courses?: (string | null)[];
    coursesKo?: (string | null)[];
    /** 인쇄된 파 줄(홀 1~18) */
    pars: (string | null)[];
    rows: ScanReadRow[];
}

const str = (v: unknown, max: number): string | null => {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s && s.length <= max ? s : null;
};
const cells18 = (v: unknown): (string | null)[] => {
    const a = Array.isArray(v) ? v : [];
    return Array.from({ length: HOLES }, (_, i) => str(a[i], 6));
};

/** 모델의 답을 믿지 않고 꼴을 맞춘다 — 18칸으로 자르고 채우며, 칸이 하나도 없는 줄은 버린다. 답이 객체가 아니면 null */
export function normalizeRead(raw: unknown): ScanRead | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const rows: ScanReadRow[] = [];
    for (const r of Array.isArray(o.rows) ? o.rows : []) {
        if (!r || typeof r !== "object") continue;
        const x = r as Record<string, unknown>;
        const cells = cells18(x.cells);
        if (!cells.some((c) => c != null)) continue;
        rows.push({ label: str(x.label, 20), cells, out: str(x.out, 6), in: str(x.in, 6), total: str(x.total, 6) });
        if (rows.length >= SCAN_MAX_ROWS) break;
    }
    const kind: ScanCardKind = o.kind === "app" || o.kind === "handwritten" ? o.kind : "other";
    const pair = (v: unknown) => { const a = Array.isArray(v) ? v : []; return [str(a[0], 30), str(a[1], 30)]; };
    return { kind, date: str(o.date, 24), club: str(o.club, 60), clubKo: str(o.club_ko ?? o.clubKo, 60), courses: pair(o.courses), coursesKo: pair(o.courses_ko ?? o.coursesKo), pars: cells18(o.pars), rows };
}

/** 카드의 날짜 → YYYY-MM-DD. "2016/10/10" · "2016.10.10" · "2016-10-10" · "2016년 10월 10일". 못 읽으면 null */
export function cardDay(raw: string | null | undefined): string | null {
    const m = /(20\d{2})\s*[./\-년]\s*(\d{1,2})\s*[./\-월]\s*(\d{1,2})/.exec(String(raw ?? "").normalize("NFKC"));
    if (!m) return null;
    const mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ── 카드의 골프장 · 코스를 우리 명부와 맞춘다(2026-10-13 오너: "스코어카드를 첨부하면 자동으로 CC명과 전후반 · 날짜까지 인식해야") ── */

const CLUB_WORDS = /\(주\)|주식회사|컨트리클럽|골프앤리조트|골프&리조트|골프리조트|골프클럽|골프장|컨트리|리조트|클럽|countryclub|golfclub|golf&resort|golfresort|country|resort|golf|club|cc|gc/g;
/** 골프장 이름의 맞춤 열쇠 — 띄어쓰기 · 기호 · '컨트리클럽' 같은 꼬리말을 걷는다 */
export const clubKey = (name: string | null | undefined): string =>
    String(name ?? "").normalize("NFKC").toLowerCase().replace(/[\s·.,'"_\-]/g, "").replace(CLUB_WORDS, "").replace(/[^0-9a-z가-힣]/g, "");
/** 코스 이름의 맞춤 열쇠 — '코스' · 'course' 를 걷는다 */
export const courseKey = (name: string | null | undefined): string =>
    String(name ?? "").normalize("NFKC").toLowerCase().replace(/\s|코스|course/g, "").replace(/[^0-9a-z가-힣]/g, "");

export interface ScanClub { id: string; name: string }
export interface ScanClubCourse { name: string; pars: readonly number[] }

/**
 * 카드의 골프장 이름으로 명부에서 한 곳을 고른다. 이름이 꼭 맞는 곳이 하나면 그곳, 여럿이면 카드의 파와 코스가 맞는 곳이 하나일 때만.
 * 파만으로는 고르지 않는다(파 배치가 같은 골프장이 많다) — 못 고르면 null, 화면이 사람에게 묻는다.
 */
export function matchClub(read: Pick<ScanRead, "club" | "clubKo">, clubs: readonly ScanClub[], parsFit: (clubId: string) => boolean): ScanClub | null {
    const keys = [clubKey(read.club), clubKey(read.clubKo)].filter((k) => k.length >= 2);
    if (!keys.length) return null;
    let hits = clubs.filter((c) => keys.includes(clubKey(c.name)));
    if (!hits.length) hits = clubs.filter((c) => { const k = clubKey(c.name); return k.length >= 2 && keys.some((x) => k.includes(x) || x.includes(k)); });
    if (hits.length === 1) return hits[0];
    const fit = hits.filter((c) => parsFit(c.id));
    return fit.length === 1 ? fit[0] : null;
}

const samePars = (a: readonly (number | null)[], b: readonly number[]) => a.length === 9 && b.length >= 9 && a.every((x, i) => x != null && x === b[i]);

/** 그 골프장의 코스 가운데 전반 · 후반을 고른다 — 이름이 맞는 것, 없으면 인쇄된 파와 꼭 같은 코스가 하나일 때 그것 */
export function matchCourses(read: Pick<ScanRead, "courses" | "coursesKo" | "pars">, courses: readonly ScanClubCourse[]): [ScanClubCourse | null, ScanClubCourse | null] {
    const printed = read.pars.map(parOf);
    const pick = (i: 0 | 1): ScanClubCourse | null => {
        const keys = [courseKey(read.courses?.[i]), courseKey(read.coursesKo?.[i])].filter(Boolean);
        const byName = courses.filter((c) => keys.includes(courseKey(c.name)));
        if (byName.length === 1) return byName[0];
        const byPar = courses.filter((c) => samePars(printed.slice(i * 9, i * 9 + 9), c.pars));
        return byPar.length === 1 ? byPar[0] : null;
    };
    return [pick(0), pick(1)];
}

/** 카드의 인쇄된 파가 그 골프장의 코스 둘로 설명되는가(전반 · 후반 각각 같은 파의 코스가 있다) */
export function clubParsFit(read: Pick<ScanRead, "pars">, courses: readonly ScanClubCourse[]): boolean {
    const printed = read.pars.map(parOf);
    return [0, 9].every((from) => courses.some((c) => samePars(printed.slice(from, from + 9), c.pars)));
}

/** 방이 모르는 홀은 카드에 인쇄된 파로 — 화면과 계산이 같은 파를 쓰게 한 벌로 만든다 */
export function effectivePars(read: Pick<ScanRead, "pars">, pars: readonly number[] | null): { pars: number[]; known: boolean[] } {
    const printed = read.pars.map(parOf);
    const out = Array.from({ length: HOLES }, (_, h) => (pars ? pars[h] : printed[h]) ?? null);
    return { pars: out.map((p) => p ?? 4), known: out.map((p) => p != null) };
}

/**
 * 공식으로 올릴 수 있는가 — **카드에서 읽은 그대로**일 때만(오너: "스코어카드 넣을 정도의 정성이면 공식으로 인증해 주자").
 * 읽은 줄과 올린 줄이 다른 칸(오독을 고친 칸 · 빈칸을 채운 칸)이 이 수를 넘으면 그 기록은 카드의 것이 아니라 손으로 적은 것이다 → 미인증.
 */
export const SCAN_OFFICIAL_MAX_EDITS = 4;
export function scanEditCount(read: readonly number[], final: readonly number[]): number {
    let n = 0;
    for (let h = 0; h < HOLES; h++) if ((Number(read[h]) || 0) !== (Number(final[h]) || 0)) n++;
    return n;
}

/** 카드의 날짜를 기록의 날로 쓸 수 있는가 — 오늘까지, 2010년부터(앞날 · 터무니없는 옛날은 오독으로 본다) */
export function usableCardDay(day: string | null | undefined, today: string): string | null {
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today && day >= "2010-01-01" ? day : null;
}

/** 시각 → 한국 날짜(YYYY-MM-DD) */
export const scanKstDay = (ms: number): string => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

/** 칸의 글자 → 수. 부호가 적혀 있었는지도 같이(상대 표기를 가리는 단서). 수가 아니면 null */
export function cellNumber(raw: string | null | undefined): { n: number; signed: boolean } | null {
    if (raw == null) return null;
    const s = raw.normalize("NFKC").replace(/[−–—]/g, "-").replace(/\s+/g, "");
    if (/^(E|PAR|파)$/i.test(s)) return { n: 0, signed: true };
    const m = /^([+-])?(\d{1,2})$/.exec(s);
    if (!m) return null;
    const n = Number(m[2]);
    return { n: m[1] === "-" ? -n : n, signed: !!m[1] };
}

/** 줄의 표기 — relative: 파를 0 으로 둔 표기(이 꼴의 카드가 쓰는 것) · strokes: 친 타수 그대로 */
export type ScanNotation = "strokes" | "relative";

/**
 * 줄의 표기를 가린다. 부호나 0 이 하나라도 있으면 상대 표기다(타수에 0 은 없다).
 * 0 도 부호도 없이 1 · 2 만 있는 줄도 있다 — 타수 평균이 2.5 를 밑돌 수는 없으니 그것으로 가린다.
 */
export function rowNotation(cells: readonly (string | null)[]): ScanNotation {
    const nums = cells.map(cellNumber).filter((x): x is { n: number; signed: boolean } => !!x);
    if (!nums.length) return "relative";
    if (nums.some((x) => x.signed || x.n === 0)) return "relative";
    return nums.reduce((s, x) => s + x.n, 0) / nums.length < 2.5 ? "relative" : "strokes";
}

function parOf(raw: string | null | undefined): number | null {
    const p = cellNumber(raw ?? null);
    return p && !p.signed && p.n >= 3 && p.n <= 6 ? p.n : null;
}

/** 칸 하나 → 타수. 상대 표기는 파가 있어야 바꿀 수 있다. 1~15 를 벗어나면 못 읽은 것으로 본다 */
export function cellStrokes(raw: string | null, notation: ScanNotation, par: number | null): number | null {
    const c = cellNumber(raw);
    if (!c) return null;
    const n = notation === "relative" ? (par == null ? null : par + c.n) : c.signed ? null : c.n;
    return n != null && isValidStroke(n) ? n : null;
}

export type CellState = "ok" | "check" | "empty";
/**
 * 확인이 필요한 까닭 — sum: 이 아홉 홀의 합이 카드와 다르다(어느 칸인지는 모른다)
 * · sign: 그 가운데 **부호가 가려졌을 법한 칸**(새 그림이 − 를 덮는다) — 이 칸의 부호를 뒤집으면 합이 맞는다
 * · derived: 못 읽은 칸이 아홉 홀에 하나뿐이라 **카드의 합에서 거꾸로 계산한 값**(버디 표시에 가린 칸이 대개 이렇다)
 */
export type CellWhy = "sum" | "sign" | "derived";
export interface ScanCell {
    /** 0 = 빈칸(못 읽음) */
    strokes: number;
    state: CellState;
    why?: CellWhy;
    /** sign 일 때 — 부호를 뒤집은 값(이쪽이 맞을 가능성이 높다) */
    alt?: number;
}
/**
 * 합계 맞춰 보기 — ok: null 이면 견줄 수 없음(카드에 합이 없거나 칸을 다 못 읽음).
 * off: 읽은 합 − 카드의 합(타수로). 0 이면 맞은 것.
 */
export interface SumCheck { printed: number | null; read: number | null; ok: boolean | null; off: number | null }
export interface ScanRow {
    label: string | null;
    notation: ScanNotation;
    cells: ScanCell[];
    /** 앞 아홉 · 뒤 아홉 · 전체 */
    out: SumCheck;
    in: SumCheck;
    total: SumCheck;
}
/** course: 카드의 파가 방의 코스와 다르다 · date: 카드의 날짜가 이 라운드의 날과 다르다 */
export type ScanNotice = "course" | "date";
export interface ScanDraft {
    rows: ScanRow[];
    /** 카드에 찍힌 날(읽혔을 때) */
    day: string | null;
    /** 카드의 파와 방의 파 — 견준 홀 수와 다른 홀 수 */
    par: { compared: number; differ: number };
    notices: ScanNotice[];
}

/** 인쇄된 합(타수일 수도, 파 기준일 수도 있다)을 읽은 타수 합과 견준다 — 두 풀이 가운데 읽은 합에 가까운 쪽으로 본다 */
function sumCheck(printed: string | null, strokes: readonly number[], pars: readonly (number | null)[]): SumCheck {
    const p = cellNumber(printed);
    const complete = strokes.length > 0 && strokes.every((s) => s > 0);
    const read = complete ? strokes.reduce((a, b) => a + b, 0) : null;
    if (!p || read == null) return { printed: p ? p.n : null, read, ok: null, off: null };
    const parSum = pars.every((x) => x != null) ? (pars as number[]).reduce((a, b) => a + b, 0) : null;
    const offs = [...(p.signed ? [] : [read - p.n]), ...(parSum != null ? [read - parSum - p.n] : [])];
    if (!offs.length) return { printed: p.n, read, ok: null, off: null };
    const off = offs.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
    return { printed: p.n, read, ok: off === 0, off };
}

/**
 * 받아쓴 것을 초안으로. pars · parKnown 은 방의 코스 파(모르는 홀은 카드에 인쇄된 파로 대신한다 — 상대 표기를 바꿀 때만).
 * roundDay(이 라운드의 한국 날짜)를 주면 카드의 날짜와 견준다 — 다르면 옛 카드이거나 다른 라운드의 카드다.
 */
export function buildScanDraft(read: ScanRead | null | undefined, pars: readonly number[], parKnown: readonly boolean[], roundDay?: string | null): ScanDraft | null {
    if (!read || !read.rows.length) return null;
    const notices: ScanNotice[] = [];

    // 홀마다 쓸 파 — 방이 아는 파가 먼저, 모르면 카드에 인쇄된 파
    const printedPar = read.pars.map(parOf);
    const usePar = Array.from({ length: HOLES }, (_, h) => (parKnown[h] ? pars[h] : printedPar[h]) ?? null);
    let compared = 0, differ = 0;
    for (let h = 0; h < HOLES; h++) {
        if (!parKnown[h] || printedPar[h] == null) continue;
        compared++;
        if (printedPar[h] !== pars[h]) differ++;
    }
    // 세 홀 넘게 다르면 다른 코스다(한두 홀은 오독일 수 있다)
    if (differ >= 3) notices.push("course");
    const day = cardDay(read.date);
    if (day && roundDay && day !== roundDay) notices.push("date");

    const rows: ScanRow[] = read.rows.map((r) => {
        const notation = rowNotation(r.cells);
        const rel = r.cells.map((raw) => cellNumber(raw)?.n ?? null);
        const cells: ScanCell[] = r.cells.map((raw, h) => {
            const x = cellStrokes(raw, notation, usePar[h]);
            return x != null ? { strokes: x, state: "ok" } : { strokes: 0, state: "empty" };
        });
        // 아홉 홀에서 못 읽은 칸이 하나뿐이고 카드에 그 아홉 홀의 합이 있으면, 빈칸은 합에서 나온다 — 읽은 것이 아니니 '확인 필요'로 둔다
        for (const [from, printed] of [[0, r.out], [9, r.in]] as const) {
            const p = cellNumber(printed);
            const empty = cells.slice(from, from + 9).flatMap((c, i) => (c.state === "empty" ? [from + i] : []));
            if (!p || empty.length !== 1) continue;
            const others = cells.slice(from, from + 9).reduce((a, c) => a + c.strokes, 0);
            const halfPars = usePar.slice(from, from + 9);
            const parSum = halfPars.every((x) => x != null) ? (halfPars as number[]).reduce((a, b) => a + b, 0) : null;
            // 카드의 합이 타수일 때와 파 기준일 때 — 한 홀의 타수가 되는 쪽은 하나뿐이다
            const fits = [...(p.signed ? [] : [p.n - others]), ...(parSum != null ? [parSum + p.n - others] : [])].filter(isValidStroke);
            if (fits.length === 1) cells[empty[0]] = { strokes: fits[0], state: "check", why: "derived" };
        }
        const strokes = cells.map((c) => c.strokes);
        const half = (from: number, printed: string | null) => sumCheck(printed, strokes.slice(from, from + 9), usePar.slice(from, from + 9));
        const out = half(0, r.out), inn = half(9, r.in);
        for (const [from, chk] of [[0, out], [9, inn]] as const) {
            if (chk.ok !== false || chk.off == null) continue;
            // 합이 안 맞는 아홉 홀은 어느 칸이 틀렸는지 모른다 — 읽힌 칸을 전부 '확인 필요'로 내린다
            for (let h = from; h < from + 9; h++) if (cells[h].state === "ok") cells[h] = { ...cells[h], state: "check", why: "sum" };
            // 가려진 − : 읽은 합이 카드보다 꼭 2n 많고 +n 으로 읽힌 칸이 있으면, 그 칸이 −n 이었을 법하다
            if (notation !== "relative" || chk.off <= 0 || chk.off % 2 !== 0) continue;
            const n = chk.off / 2;
            for (let h = from; h < from + 9; h++) {
                if (rel[h] !== n || usePar[h] == null) continue;
                const alt = (usePar[h] as number) - n;
                if (isValidStroke(alt)) cells[h] = { ...cells[h], why: "sign", alt };
            }
        }
        return { label: r.label, notation, cells, out, in: inn, total: sumCheck(r.total, strokes, usePar) };
    });
    return { rows, day, par: { compared, differ }, notices };
}

export function draftCounts(d: ScanDraft): Record<CellState, number> {
    const n: Record<CellState, number> = { ok: 0, check: 0, empty: 0 };
    for (const r of d.rows) for (const c of r.cells) n[c.state]++;
    return n;
}

const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

/**
 * 줄을 참가자와 잇는 첫 짐작 — 줄 앞의 글자가 참가자 이름과 겹칠 때만(한 사람에게 한 줄). 혼자 치는 방의 한 줄은 그 사람.
 * 순서로는 짐작하지 않는다(카드의 줄 순서와 방의 참가 순서는 다르다) — 못 이은 줄은 사람이 고른다.
 */
export function guessSeats(labels: readonly (string | null)[], players: readonly { memberId: string; name?: string | null }[]): (string | null)[] {
    if (labels.length === 1 && players.length === 1) return [players[0].memberId];
    const used = new Set<string>();
    return labels.map((label) => {
        const l = label ? squash(label) : "";
        if (l.length < 2) return null;
        const hits = players.filter((p) => { const n = squash(p.name ?? ""); return n.length >= 2 && !used.has(p.memberId) && (n.includes(l) || l.includes(n)); });
        if (hits.length !== 1) return null;
        used.add(hits[0].memberId);
        return hits[0].memberId;
    });
}

/**
 * 확인을 마친 줄을 방의 점수에 얹는다 — 읽은 칸(1~15)만 덮고, 빈칸은 원래 점수를 둔다. 이은 사람이 없는 줄은 버린다.
 * 방에 없는 사람은 만들지 않는다.
 */
export function applyScanRows<P extends { memberId: string; scores?: unknown }>(
    players: readonly P[], rows: readonly { memberId: string | null; strokes: readonly number[] }[],
): P[] {
    const by = new Map<string, readonly number[]>();
    for (const r of rows) if (r.memberId && !by.has(r.memberId)) by.set(r.memberId, r.strokes);
    return players.map((p) => {
        const s = by.get(p.memberId);
        if (!s) return p;
        const cur = Array.isArray(p.scores) ? (p.scores as unknown[]) : [];
        const scores = Array.from({ length: HOLES }, (_, h) => (isValidStroke(s[h]) ? s[h] : Number(cur[h]) || 0));
        return { ...p, scores };
    });
}

/** 화면의 말 — 확인 화면과 안내가 같은 문장을 쓴다 */
export const SCAN_COPY = {
    title: "스코어카드로 채우기",
    lead: "앱에서 받은 스코어카드를 읽어 점수판에 옮겨요. 넣기 전에 꼭 한 번 확인해 주세요.",
    accept: "스마트스코어처럼 앱이 만든 스코어카드만 읽어요. 손으로 적은 카드는 읽지 않아요.",
    pick: "스코어카드 그림 고르기",
    privacy: "그림은 읽는 동안만 쓰고 저장하지 않아요.",
    abroad: "글자를 읽으려고 그림을 해외의 AI 서비스로 보내요. 원하지 않으면 올리지 말고 직접 적어 주세요.",
    reading: "카드를 읽고 있어요",
    states: { ok: "확정", check: "확인 필요", empty: "빈칸" } as Record<CellState, string>,
    why: { sum: "아홉 홀 합이 카드와 달라요", sign: "버디 표시에 − 가 가려졌을 수 있어요", derived: "가려진 칸이라 카드의 합에서 계산했어요" } as Record<CellWhy, string>,
    notices: {
        course: "카드의 파가 이 방의 코스와 달라요. 코스를 맞게 골랐는지 확인해 주세요.",
        date: "카드의 날짜가 이 라운드의 날과 달라요. 이 라운드의 카드가 맞는지 확인해 주세요.",
    } as Record<ScanNotice, string>,
    seat: "이 줄은 누구인가요?",
    apply: "점수판에 넣기",
    applied: "점수판에 넣었어요",
    handwritten: "손으로 적은 카드는 읽지 않아요. 앱에서 받은 스코어카드를 올려 주세요.",
    none: "스코어카드를 찾지 못했어요. 카드 전체가 나오게 다시 올려 주세요.",
    record: "이 카드로 기록하기",
    official: "카드에서 읽은 그대로라 공식 라운드로 남아요.",
    unofficial: "카드와 다르게 고친 칸이 많아 미인증으로 남아요.",
    askClub: "골프장을 찾지 못했어요. 이름으로 찾아 주세요.",
    askRow: "내 줄을 골라 주세요.",
    askHoles: "18홀이 다 있어야 기록돼요. 빈칸을 눌러 채워 주세요.",
    limit: "오늘은 더 읽을 수 없어요. 내일 다시 쓸 수 있어요.",
    failed: "카드를 읽지 못했어요. 잠시 뒤에 다시 해 주세요.",
} as const;

/** 합이 안 맞을 때의 한 줄 — "앞 9홀 읽은 합 41 · 카드에는 40". 맞거나 견줄 수 없으면 null */
export function sumLine(label: string, c: SumCheck): string | null {
    if (c.ok !== false || c.printed == null || c.read == null) return null;
    return `${label} 읽은 합 ${c.read} · 카드에는 ${c.printed}`;
}
