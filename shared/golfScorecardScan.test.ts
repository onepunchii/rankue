import { describe, it, expect } from "vitest";
import {
    applyScanRows, buildScanDraft, cardDay, clubKey, clubParsFit, courseKey, effectivePars, matchClub, matchCourses, scanDailyLimit, scanEditCount, usableCardDay, SCAN_OFFICIAL_MAX_EDITS, cellNumber, cellStrokes, draftCounts, guessSeats, normalizeRead, rowNotation, scanKstDay, sumLine,
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

describe("카드의 골프장 · 코스 · 날짜를 명부와 맞추기", () => {
    const clubs = [{ id: "a", name: "솔모로컨트리클럽" }, { id: "b", name: "(주)캐슬렉스서울 캐슬렉스골프클럽" }, { id: "c", name: "남서울컨트리클럽" }, { id: "d", name: "뉴서울컨트리클럽" }, { id: "e", name: "서울CC" }];
    const never = () => false;
    it("열쇠 — 꼬리말 · 띄어쓰기 · 기호를 걷는다", () => {
        expect(clubKey("솔모로 컨트리클럽")).toBe("솔모로");
        expect(clubKey("SOLMORO COUNTRY CLUB")).toBe("solmoro");
        expect(clubKey("(주)캐슬렉스서울 캐슬렉스골프클럽")).toBe("캐슬렉스서울캐슬렉스");
        expect(courseKey("Maple Course")).toBe("maple");
        expect(courseKey("레이크 코스")).toBe("레이크");
    });
    it("영문 로고의 카드 — 한글로 옮긴 이름으로 맞춘다", () => {
        expect(matchClub({ club: "SOLMORO COUNTRY CLUB", clubKo: "솔모로 컨트리클럽" }, clubs, never)?.id).toBe("a");
        expect(matchClub({ club: "솔모로CC", clubKo: null }, clubs, never)?.id).toBe("a");
    });
    it("이름의 일부만 맞아도 한 곳이면 고른다 · 여럿이면 파가 맞는 한 곳만 · 못 고르면 null(사람에게 묻는다)", () => {
        expect(matchClub({ club: "캐슬렉스", clubKo: null }, clubs, never)?.id).toBe("b");
        expect(matchClub({ club: "서울", clubKo: null }, clubs, never)?.id).toBe("e"); // 꼭 맞는 이름이 먼저
        expect(matchClub({ club: "서울컨트리", clubKo: null }, [clubs[2], clubs[3]], never)).toBeNull();
        expect(matchClub({ club: "서울컨트리", clubKo: null }, [clubs[2], clubs[3]], (id) => id === "d")?.id).toBe("d");
        expect(matchClub({ club: null, clubKo: null }, clubs, () => true)).toBeNull();
        expect(matchClub({ club: "없는골프장", clubKo: null }, clubs, () => true)).toBeNull();
    });
    const courses = [{ name: "메이플", pars: [5, 4, 3, 4, 5, 4, 3, 4, 4] }, { name: "파인", pars: [5, 4, 3, 4, 5, 4, 4, 3, 4] }, { name: "체리", pars: [4, 4, 3, 4, 5, 4, 4, 3, 5] }];
    const printed = ["5", "4", "3", "4", "5", "4", "3", "4", "4", "5", "4", "3", "4", "5", "4", "4", "3", "4"];
    it("코스 — 이름(한글로 옮긴 것 포함)으로, 없으면 인쇄된 파와 꼭 같은 코스가 하나일 때", () => {
        expect(matchCourses({ courses: ["Maple", "Pine"], coursesKo: ["메이플", "파인"], pars: printed }, courses).map((c) => c?.name)).toEqual(["메이플", "파인"]);
        expect(matchCourses({ courses: ["A", "B"], coursesKo: [null, null], pars: printed }, courses).map((c) => c?.name)).toEqual(["메이플", "파인"]);
        expect(matchCourses({ courses: ["A", "B"], coursesKo: [null, null], pars: printed }, [...courses, { name: "메이플2", pars: courses[0].pars }]).map((c) => c?.name)).toEqual([undefined, "파인"]);
        expect(clubParsFit({ pars: printed }, courses)).toBe(true);
        expect(clubParsFit({ pars: printed }, [courses[0], courses[2]])).toBe(false);
    });
    it("날짜 — 오늘까지 · 2010년부터만 기록의 날로 쓴다", () => {
        expect(usableCardDay("2026-10-12", "2026-10-13")).toBe("2026-10-12");
        expect(usableCardDay("2016-10-10", "2026-10-13")).toBe("2016-10-10");
        for (const bad of ["2026-10-14", "2009-12-31", "2026/10/12", null, ""]) expect(usableCardDay(bad, "2026-10-13"), String(bad)).toBeNull();
    });
    it("받아쓴 것에서 골프장 · 코스 칸을 받는다(없어도 된다)", () => {
        const r = normalizeRead({ kind: "app", club: " SOLMORO ", club_ko: "솔모로", courses: ["Maple", "Pine", "x"], courses_ko: ["메이플"], rows: [] })!;
        expect([r.club, r.clubKo, r.courses, r.coursesKo]).toEqual(["SOLMORO", "솔모로", ["Maple", "Pine"], ["메이플", null]]);
        expect(normalizeRead({ kind: "app", rows: [] })).toMatchObject({ club: null, courses: [null, null] });
    });
});

describe("공식으로 올릴 수 있는가 — 카드에서 읽은 그대로일 때", () => {
    it("읽은 줄과 올린 줄이 다른 칸을 센다 — 고친 칸 · 채운 빈칸 모두", () => {
        const readRow = [...ALL]; readRow[3] = 0;
        const final = [...ALL]; final[0] = ALL[0] + 1;
        expect(scanEditCount(ALL, ALL)).toBe(0);
        expect(scanEditCount(readRow, final)).toBe(2);
        expect(scanEditCount([], ALL)).toBe(18);
        expect(SCAN_OFFICIAL_MAX_EDITS).toBe(4);
    });
    it("파 한 벌 — 명부의 파가 있으면 그것, 없으면 카드에 인쇄된 파(못 읽은 홀은 모르는 홀)", () => {
        const printed = s(PARS) as (string | null)[]; printed[2] = null;
        expect(effectivePars({ pars: printed }, PARS)).toEqual({ pars: PARS, known: KNOWN });
        const e = effectivePars({ pars: printed }, null);
        expect(e.known[2]).toBe(false);
        expect(e.known.filter(Boolean)).toHaveLength(17);
        expect(e.pars[0]).toBe(PARS[0]);
    });
});

describe("하루 횟수 한도", () => {
    it("넣지 않으면 없다 — 양의 정수를 넣었을 때만 건다", () => {
        for (const none of [undefined, null, "", "0", "-3", "abc", "2.5"]) expect(scanDailyLimit(none), String(none)).toBeNull();
        expect(scanDailyLimit("10")).toBe(10);
    });
});
