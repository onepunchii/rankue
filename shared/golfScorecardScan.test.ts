import { describe, it, expect } from "vitest";
import {
    applyScanRows, buildScanDraft, cardDay, cellNumber, cellStrokes, draftCounts, guessSeats, normalizeRead, rowNotation, scanKstDay, sumLine,
    type ScanRead,
} from "./golfScorecardScan";

const PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]; // 36 + 36
const KNOWN = new Array(18).fill(true);
const s = (a: number[]) => a.map(String);
const FRONT = [5, 4, 4, 5, 6, 4, 3, 5, 5]; // 41
const BACK = [4, 5, 3, 4, 6, 5, 4, 4, 6]; // 41
const ALL = [...FRONT, ...BACK];
/** 이 꼴의 카드가 쓰는 표기 — 파 기준, 부호는 − 만 */
const REL = ALL.map((v, h) => String(v - PARS[h]));
const row = (cells: (string | null)[], out: string | null = null, inn: string | null = null, total: string | null = null, label: string | null = null) => ({ label, cells, out, in: inn, total });
const read = (rows: ReturnType<typeof row>[], over: Partial<ScanRead> = {}): ScanRead => ({ kind: "app", date: null, pars: s(PARS), rows, ...over });

describe("받아쓴 것의 꼴 맞추기", () => {
    it("18칸으로 자르고 채운다 · 칸이 하나도 없는 줄은 버린다 · 넷까지만", () => {
        const r = normalizeRead({
            kind: "app", date: " 2016/10/10 ",
            pars: ["4", 4, "x".repeat(9)],
            rows: [
                { label: " 홍길동 ", cells: [0, "1", null, "  "], out: "41", in: null, total: 82 },
                { label: null, cells: [] },
                ...Array.from({ length: 5 }, () => ({ cells: ["0"] })),
            ],
        })!;
        expect(r.kind).toBe("app");
        expect(r.date).toBe("2016/10/10");
        expect(r.pars).toHaveLength(18);
        expect(r.pars.slice(0, 3)).toEqual(["4", "4", null]);
        expect(r.rows).toHaveLength(4);
        expect(r.rows[0]).toMatchObject({ label: "홍길동", out: "41", in: null, total: "82" });
        expect(r.rows[0].cells.slice(0, 4)).toEqual(["0", "1", null, null]);
        expect(r.rows[0].cells).toHaveLength(18);
    });
    it("종류를 모르면 other · 객체가 아니면 null — 모델이 딴 것을 돌려줘도 터지지 않는다", () => {
        expect(normalizeRead({ kind: "poster", rows: [] })).toMatchObject({ kind: "other", rows: [] });
        expect(normalizeRead({ kind: "handwritten", rows: "x" })).toMatchObject({ kind: "handwritten", rows: [] });
        for (const bad of [null, "text", 3, []]) expect(normalizeRead(bad), JSON.stringify(bad)).toBeNull();
    });
});

describe("날짜", () => {
    it("카드에 찍힌 꼴들을 읽는다", () => {
        expect(cardDay("2016/10/10")).toBe("2016-10-10");
        expect(cardDay("DATE 2026.1.5")).toBe("2026-01-05");
        expect(cardDay("2026-10-13")).toBe("2026-10-13");
        expect(cardDay("2026년 10월 3일")).toBe("2026-10-03");
        for (const bad of [null, "", "10/10", "2026/13/01", "PM 12:52"]) expect(cardDay(bad), String(bad)).toBeNull();
    });
    it("한국 날짜 — 자정 앞뒤", () => {
        expect(scanKstDay(Date.parse("2026-10-13T14:59:00Z"))).toBe("2026-10-13");
        expect(scanKstDay(Date.parse("2026-10-13T15:00:00Z"))).toBe("2026-10-14");
    });
});

describe("칸 읽기", () => {
    it("부호 · 전각 숫자 · 긴 줄표를 알아본다", () => {
        expect(cellNumber("5")).toEqual({ n: 5, signed: false });
        expect(cellNumber("+1")).toEqual({ n: 1, signed: true });
        expect(cellNumber("−2")).toEqual({ n: -2, signed: true });
        expect(cellNumber("５")).toEqual({ n: 5, signed: false });
        expect(cellNumber("E")).toEqual({ n: 0, signed: true });
        for (const bad of [null, "", "-", "5/2", "abc", "123"]) expect(cellNumber(bad), String(bad)).toBeNull();
    });
    it("표기 — 부호나 0 이 있으면 파 기준, 0 없이 1 · 2 뿐이어도 파 기준(타수 평균은 2.5 를 밑돌 수 없다)", () => {
        expect(rowNotation(s(FRONT))).toBe("strokes");
        expect(rowNotation(["0", "2", "1"])).toBe("relative");
        expect(rowNotation(["-1", "1", "1"])).toBe("relative");
        expect(rowNotation(["1", "2", "1", "1", "2"])).toBe("relative");
    });
    it("타수로 — 파 기준은 파에 더한다 · 1~15 밖은 못 읽은 것", () => {
        expect(cellStrokes("1", "relative", 4)).toBe(5);
        expect(cellStrokes("-1", "relative", 5)).toBe(4);
        expect(cellStrokes("0", "relative", 3)).toBe(3);
        expect(cellStrokes("1", "relative", null)).toBeNull(); // 파를 모르면 바꿀 수 없다
        expect(cellStrokes("5", "strokes", 4)).toBe(5);
        expect(cellStrokes("16", "strokes", 4)).toBeNull();
        expect(cellStrokes("0", "strokes", 4)).toBeNull();
    });
});

describe("초안", () => {
    it("이 꼴의 카드 — 칸은 파 기준, 합은 타수. 합이 맞으면 전부 확정", () => {
        const d = buildScanDraft(read([row(REL, "41", "41", "82", "홍길동")]), PARS, KNOWN)!;
        expect(d.rows[0].notation).toBe("relative");
        expect(d.rows[0].cells.map((c) => c.strokes)).toEqual(ALL);
        expect(draftCounts(d)).toEqual({ ok: 18, check: 0, empty: 0 });
        expect(d.rows[0].out).toEqual({ printed: 41, read: 41, ok: true, off: 0 });
        expect(d.rows[0].total).toEqual({ printed: 82, read: 82, ok: true, off: 0 });
        expect(d.notices).toEqual([]);
        expect(d.par).toEqual({ compared: 18, differ: 0 });
    });
    it("합이 안 맞는 아홉 홀은 전부 '확인 필요'로 내린다 — 어느 칸이 틀렸는지 모른다", () => {
        const wrong = [...REL]; wrong[4] = "2"; // 1 을 2 로 잘못 읽음 → 42
        const d = buildScanDraft(read([row(wrong, "41", "41", "82")]), PARS, KNOWN)!;
        expect(d.rows[0].out).toEqual({ printed: 41, read: 42, ok: false, off: 1 });
        expect(d.rows[0].cells.slice(0, 9).every((c) => c.state === "check" && c.why === "sum")).toBe(true);
        expect(d.rows[0].cells.slice(9).every((c) => c.state === "ok")).toBe(true);
        expect(sumLine("앞 9홀", d.rows[0].out)).toBe("앞 9홀 읽은 합 42 · 카드에는 41");
        expect(sumLine("뒤 9홀", d.rows[0].in)).toBeNull();
    });
    it("가려진 − : 버디(−1)를 1 로 읽으면 합이 꼭 2 많다 — +1 로 읽힌 칸을 짚고 뒤집은 값을 같이 준다", () => {
        // 앞 아홉: 0 1 -1 1 0 0 1 0 1 → 타수 39. 새 그림에 가려 −1 을 1 로 읽었다
        const cells = ["0", "1", "1", "1", "0", "0", "1", "0", "1", ...new Array(9).fill(null)];
        const d = buildScanDraft(read([row(cells, "39")]), PARS, KNOWN)!;
        expect(d.rows[0].out).toMatchObject({ printed: 39, read: 41, ok: false, off: 2 });
        const front = d.rows[0].cells.slice(0, 9);
        expect(front.every((c) => c.state === "check")).toBe(true);
        expect(front.map((c) => c.why)).toEqual(["sum", "sign", "sign", "sign", "sum", "sum", "sign", "sum", "sign"]);
        expect(front[2]).toEqual({ strokes: 4, state: "check", why: "sign", alt: 2 }); // 파 3 의 버디
        expect(front[0].alt).toBeUndefined();
    });
    it("합이 홀수만큼 다르거나 모자라면 부호 탓이 아니다", () => {
        const less = [...REL]; less[0] = "0"; // 1 → 0 : 합이 1 모자람
        const d = buildScanDraft(read([row(less, "41", "41")]), PARS, KNOWN)!;
        expect(d.rows[0].cells.slice(0, 9).every((c) => c.why === "sum" && c.alt === undefined)).toBe(true);
    });
    it("카드의 합이 파 기준으로 적혀 있어도 맞춰 본다", () => {
        const d = buildScanDraft(read([row(REL, "+5", "5", "10")]), PARS, KNOWN)!;
        expect([d.rows[0].out.ok, d.rows[0].in.ok, d.rows[0].total.ok]).toEqual([true, true, true]);
    });
    it("못 읽은 칸이 아홉 홀에 하나뿐이면 카드의 합에서 거꾸로 채운다 — 읽은 것이 아니니 '확인 필요'", () => {
        const cells: (string | null)[] = [...REL]; cells[4] = null;
        const d = buildScanDraft(read([row(cells, "41", "41", "82")]), PARS, KNOWN)!;
        expect(d.rows[0].cells[4]).toEqual({ strokes: 6, state: "check", why: "derived" });
        expect(d.rows[0].out.ok).toBe(true);
        expect(d.rows[0].total.ok).toBe(true);
        expect(draftCounts(d)).toEqual({ ok: 17, check: 1, empty: 0 });
        // 카드의 합이 파 기준이어도
        expect(buildScanDraft(read([row(cells, "+5")]), PARS, KNOWN)!.rows[0].cells[4]).toEqual({ strokes: 6, state: "check", why: "derived" });
    });
    it("못 읽은 칸이 둘이거나 카드에 합이 없으면 빈칸으로 둔다 — 그 아홉 홀의 합은 견주지 않는다", () => {
        const two: (string | null)[] = [...REL]; two[4] = null; two[5] = null;
        const d = buildScanDraft(read([row(two, "41", "41", "82")]), PARS, KNOWN)!;
        expect(d.rows[0].cells[4]).toEqual({ strokes: 0, state: "empty" });
        expect(d.rows[0].out.ok).toBeNull();
        expect(d.rows[0].in.ok).toBe(true);
        expect(d.rows[0].total.ok).toBeNull();
        const one: (string | null)[] = [...REL]; one[4] = null;
        expect(buildScanDraft(read([row(one, null, "41")]), PARS, KNOWN)!.rows[0].cells[4]).toEqual({ strokes: 0, state: "empty" });
    });
    it("합에서 나온 값이 한 홀의 타수가 될 수 없으면 채우지 않는다", () => {
        const cells: (string | null)[] = [...REL]; cells[4] = null;
        expect(buildScanDraft(read([row(cells, "99")]), PARS, KNOWN)!.rows[0].cells[4]).toEqual({ strokes: 0, state: "empty" });
    });
    it("아홉 홀만 있는 카드 — 뒤 아홉은 빈칸, 앞 아홉은 검산된다", () => {
        const d = buildScanDraft(read([row([...REL.slice(0, 9), ...new Array(9).fill(null)], "41")]), PARS, KNOWN)!;
        expect(draftCounts(d)).toEqual({ ok: 9, check: 0, empty: 9 });
        expect(d.rows[0].out.ok).toBe(true);
    });
    it("방이 파를 모르는 홀은 카드에 인쇄된 파로 바꾼다 · 그것도 없으면 빈칸", () => {
        const known = KNOWN.map((_, h) => h !== 0 && h !== 1);
        const printed: (string | null)[] = s(PARS); printed[1] = null;
        const d = buildScanDraft(read([row(["1", "1", "0"])], { pars: printed }), PARS, known)!;
        expect(d.rows[0].cells.slice(0, 3).map((c) => [c.strokes, c.state])).toEqual([[5, "ok"], [0, "empty"], [3, "ok"]]);
    });
    it("카드의 파가 세 홀 넘게 다르면 코스가 다르다고 알린다(한두 홀은 오독일 수 있다)", () => {
        const two = s(PARS); two[0] = "5"; two[1] = "5";
        expect(buildScanDraft(read([row(REL)], { pars: two }), PARS, KNOWN)!.notices).toEqual([]);
        const three = [...two]; three[2] = "4";
        const d = buildScanDraft(read([row(REL)], { pars: three }), PARS, KNOWN)!;
        expect(d.notices).toEqual(["course"]);
        expect(d.par).toEqual({ compared: 18, differ: 3 });
    });
    it("카드의 날짜가 이 라운드의 날과 다르면 알린다 — 날짜를 못 읽었거나 라운드 날을 모르면 말하지 않는다", () => {
        const r = read([row(REL)], { date: "2016/10/10" });
        expect(buildScanDraft(r, PARS, KNOWN, "2026-10-13")!.notices).toEqual(["date"]);
        expect(buildScanDraft(r, PARS, KNOWN, "2016-10-10")!).toMatchObject({ notices: [], day: "2016-10-10" });
        expect(buildScanDraft(r, PARS, KNOWN)!.notices).toEqual([]);
        expect(buildScanDraft(read([row(REL)]), PARS, KNOWN, "2026-10-13")!.notices).toEqual([]);
    });
    it("읽은 줄이 없으면 null", () => {
        expect(buildScanDraft(null, PARS, KNOWN)).toBeNull();
        expect(buildScanDraft(read([]), PARS, KNOWN)).toBeNull();
    });
});

describe("줄과 사람 잇기 · 점수판에 얹기", () => {
    const players = [{ memberId: "a", name: "홍길동", scores: new Array(18).fill(0) }, { memberId: "b", name: "김 철수", scores: [4, ...new Array(17).fill(0)] }];
    it("이름이 겹치는 줄만 잇는다 — 순서로는 짐작하지 않는다 · 한 사람에게 한 줄", () => {
        expect(guessSeats(["김철수", "홍길동"], players)).toEqual(["b", "a"]);
        expect(guessSeats([null, "길동"], players)).toEqual([null, "a"]);
        expect(guessSeats(["홍길동", "홍길동"], players)).toEqual(["a", null]);
        expect(guessSeats(["A", null], players)).toEqual([null, null]);
    });
    it("혼자 치는 방의 한 줄은 그 사람", () => {
        expect(guessSeats([null], [players[0]])).toEqual(["a"]);
    });
    it("읽은 칸만 덮는다 — 빈칸은 원래 점수, 이은 사람이 없는 줄 · 방에 없는 사람은 버린다", () => {
        const strokes = [5, 0, 4, ...new Array(15).fill(0)];
        const out = applyScanRows(players, [{ memberId: "b", strokes }, { memberId: null, strokes }, { memberId: "zzz", strokes }]);
        expect(out).toHaveLength(2);
        expect(out[0]).toBe(players[0]);
        expect((out[1].scores as number[]).slice(0, 3)).toEqual([5, 0, 4]);
    });
    it("범위를 벗어난 값은 얹지 않는다", () => {
        const out = applyScanRows(players, [{ memberId: "b", strokes: [16, -1, 2.5, ...new Array(15).fill(0)] }]);
        expect((out[1].scores as number[]).slice(0, 3)).toEqual([4, 0, 0]);
    });
});
