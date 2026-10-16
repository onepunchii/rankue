import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_BOOKS } from "./golfStampBooks";
import type { DatedStamp } from "./golfStampAwards";
import { GOLF_PINS, PIN_BREAK_MAX, PIN_COMPANIONS, PIN_MIN_PAR, PIN_PHOTOS, golfPin, pinsDue, type PinRound } from "./golfPins";

/**
 * 업적 핀(2026-10-12) — 1차 아홉 개 + 2차 열한 개. 있는 자료로 틀림없이 판정되는 것만 연다.
 * 적는 길(같은 표 · 순번)은 server/storage/golfStampAwards.test.ts, 자료를 읽는 길은 메모리형 DB 로 따로 돌려 봤다.
 */
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
// 2026-03-01 12:00(한국) — 하루 간격으로 놓으면 한낮의 라운드다(새벽 · 밤 핀이 붙지 않는다)
const T0 = Date.UTC(2026, 2, 1, 3, 0), DAY = 86_400_000, HOUR = 3_600_000;
const round = (i: number, score: number | null = 104, par: number | null = 72, more: Partial<PinRound> = {}): PinRound => ({ at: T0 + i * DAY, score, par, ...more });
const rounds = (n: number) => Array.from({ length: n }, (_, i) => round(i));
const book = (id: string) => STAMP_BOOKS.find((b) => b.id === id)!;
const stamp = (bookId: string, i: number, day: number): DatedStamp => { const s = book(bookId).slots[i]; return { clubId: s.clubIds[0], name: s.ledgerNames[0], firstDate: new Date(T0 + day * DAY) }; };
const ids = (r: PinRound[], s: DatedStamp[] = [], photos: number[] = []) => pinsDue(r, s, photos).map((p) => p.id);
const has = (r: PinRound[], id: string, s: DatedStamp[] = [], photos: number[] = []) => ids(r, s, photos).includes(id as never);
const at = (r: PinRound[], s: DatedStamp[], id: string, photos: number[] = []) => pinsDue(r, s, photos).find((p) => p.id === id)?.earnedAt;
/** 한국 시각으로 y-m-d h 시 */
const kst = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h - 9, 0);
const PAR = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5];
const bogeys = PAR.map((p) => p + 1);

describe("목록", () => {
    it("스물한 개 — 이름표가 겹치지 않고, 그림 파일이 다 있다. 타수 핀 셋만 숫자를 얹는다", () => {
        expect(GOLF_PINS).toHaveLength(21);
        expect(new Set(GOLF_PINS.map((p) => p.id)).size).toBe(21);
        expect(new Set(GOLF_PINS.map((p) => p.art)).size).toBe(21);
        for (const p of GOLF_PINS) {
            expect(existsSync(resolve(root, `client/public/golf/stamp-art/${p.art}.webp`)), p.art).toBe(true);
            expect(golfPin(p.id)).toBe(p);
        }
        expect(GOLF_PINS.filter((p) => p.num).map((p) => [p.id, p.num])).toEqual([["break-100", "100"], ["break-90", "90"], ["break-80", "80"]]);
        const plate = code(read("client/src/golf/stamps/pinArt.ts"));
        for (const p of GOLF_PINS.filter((x) => x.num)) expect(plate, p.art).toContain(`"${p.art}": {`);
    });

    it("조건의 글에 돈 · 내기 · 술 이야기가 없다. 판정할 수 없는 핀(니어핀 · 날씨 · 원정)은 목록에 없다", () => {
        for (const p of GOLF_PINS) expect(`${p.name} ${p.how}`, p.id).not.toMatch(/원\b|내기|상금|술|맥주|소주|만원/);
        expect(GOLF_PINS.map((p) => p.name).join(" ")).not.toMatch(/니어|우중|한여름|한겨울|원정|긴급/);
    });
});

describe("라운드 수 · 첫 도장", () => {
    const count = (r: PinRound[]) => ids(r).filter((x) => x.startsWith("rounds-"));

    it("인증 라운드 N 번째를 끝낸 날 — 10 · 50 · 100", () => {
        expect(ids(rounds(9))).toEqual([]);
        expect(ids(rounds(10))).toEqual(["rounds-10"]);
        expect(count(rounds(100))).toEqual(["rounds-10", "rounds-50", "rounds-100"]);
        expect(at(rounds(60), [], "rounds-50")).toBe(T0 + 49 * DAY);
        // 순서가 섞여 와도 때의 순서로 센다
        expect(at([...rounds(12)].reverse(), [], "rounds-10")).toBe(T0 + 9 * DAY);
    });

    it("첫 도장은 골프장을 아는 첫 인증 라운드 — 도장이 없으면 라운드가 있어도 없다", () => {
        expect(ids(rounds(3))).toEqual([]);
        const s = [stamp("gangwon", 2, 5), stamp("gangwon", 0, 3)];
        expect(ids(rounds(3), s)).toEqual(["first-stamp"]);
        expect(at(rounds(3), s, "first-stamp")).toBe(T0 + 3 * DAY);
    });
});

describe("달 · 날 · 시각", () => {
    it("세 달 연속 — 한국 날짜의 달마다 하나 이상, 석 달이 된 그 달의 첫 라운드가 받은 날. 한 달 건너뛰면 다시 센다", () => {
        const r = [kst(2026, 3, 30), kst(2026, 4, 2), kst(2026, 5, 20), kst(2026, 5, 25)].map((t): PinRound => ({ at: t, score: 104, par: 72 }));
        expect(has(r.slice(0, 2), "streak-3")).toBe(false);
        expect(at(r, [], "streak-3")).toBe(kst(2026, 5, 20));
        const gap = [kst(2026, 3, 30), kst(2026, 4, 2), kst(2026, 6, 1), kst(2026, 7, 1)].map((t): PinRound => ({ at: t, score: 104, par: 72 }));
        expect(has(gap, "streak-3")).toBe(false);
        expect(at([...gap, { at: kst(2026, 8, 9), score: 104, par: 72 }], [], "streak-3")).toBe(kst(2026, 8, 9));
    });

    it("달의 경계는 한국 시계다 — UTC 로는 3월 31일 밤이어도 한국은 4월 1일 아침", () => {
        const r = [kst(2026, 2, 10), { t: Date.UTC(2026, 2, 31, 22, 0) }, kst(2026, 5, 1)].map((x): PinRound => ({ at: typeof x === "number" ? x : x.t, score: 104, par: 72 }));
        // 2월 · (한국 4월 1일 07시) · 5월 — 3월이 비어 석 달 연속이 아니다
        expect(has(r, "streak-3")).toBe(false);
        expect(has([{ at: kst(2026, 3, 5), score: 104, par: 72 }, ...r], "streak-3")).toBe(true);
    });

    it("열두 달 개근 — 해를 넘겨도 잇달아 열두 달", () => {
        const months = Array.from({ length: 12 }, (_, i): PinRound => ({ at: Date.UTC(2026, 5 + i, 15, 3, 0), score: 104, par: 72 }));
        expect(has(months.slice(0, 11), "streak-12")).toBe(false);
        expect(at(months, [], "streak-12")).toBe(Date.UTC(2027, 4, 15, 3, 0));
    });

    it("하루 36홀 — 같은 날(한국 날짜)에 끝낸 인증 라운드 둘. 자정을 넘기면 다른 날이다", () => {
        const two = [{ at: kst(2026, 6, 6, 12), score: 104, par: 72 }, { at: kst(2026, 6, 6, 19), score: 101, par: 72 }];
        expect(at(two, [], "day-36")).toBe(kst(2026, 6, 6, 19));
        expect(has([{ at: kst(2026, 6, 6, 23), score: 104, par: 72 }, { at: kst(2026, 6, 7, 1), score: 101, par: 72 }], "day-36")).toBe(false);
        expect(has(rounds(30), "day-36")).toBe(false);
    });

    it("새벽 첫 티 — 시작한 때가 오전 4~7시(한국). 시작한 때를 모르면(옛 경기) 붙지 않는다", () => {
        const end = kst(2026, 6, 6, 11);
        expect(has([{ at: end, score: 104, par: 72, startAt: kst(2026, 6, 6, 6) }], "sunrise")).toBe(true);
        expect(at([{ at: end, score: 104, par: 72, startAt: kst(2026, 6, 6, 6) }], [], "sunrise")).toBe(end);
        expect(has([{ at: end, score: 104, par: 72, startAt: kst(2026, 6, 6, 7) }], "sunrise")).toBe(false);
        expect(has([{ at: end, score: 104, par: 72, startAt: kst(2026, 6, 6, 2) }], "sunrise")).toBe(false);
        expect(has([{ at: end, score: 104, par: 72, startAt: null }], "sunrise")).toBe(false);
        expect(has([{ at: end, score: 104, par: 72 }], "sunrise")).toBe(false);
    });

    it("야간 라운드 — 밤 8시 뒤에 끝낸 라운드", () => {
        expect(has([{ at: kst(2026, 6, 6, 20), score: 104, par: 72 }], "night")).toBe(true);
        expect(has([{ at: kst(2026, 6, 6, 19), score: 104, par: 72 }], "night")).toBe(false);
        expect(has([{ at: kst(2026, 6, 6, 23) + 59 * 60_000, score: 104, par: 72 }], "night")).toBe(true);
        expect(has(rounds(20), "night")).toBe(false);
    });
});

describe("홀 타수", () => {
    const withHoles = (strokes: (number | null)[], pars: (number | null)[] = PAR) => [round(0, 100, 72, { strokes, pars })];

    it("첫 버디 · 이글 — 파를 아는 홀에서만", () => {
        const birdie = [...bogeys]; birdie[4] = 4;                  // 파5 에서 4타
        expect(ids(withHoles(birdie))).toEqual(["birdie"]);
        const eagle = [...bogeys]; eagle[4] = 3;                    // 파5 에서 3타
        expect(ids(withHoles(eagle))).toEqual(["eagle"]);
        const ace = [...bogeys]; ace[2] = 1;                        // 파3 홀인원 = 이글
        expect(ids(withHoles(ace))).toEqual(["eagle"]);
        // 그 홀의 파를 모르면 붙지 않는다(기본값 파 4 로 판정하지 않는다)
        const pars = [...PAR] as (number | null)[]; pars[4] = null;
        expect(ids(withHoles(birdie, pars))).toEqual([]);
        // 타수가 비었거나 0 인 홀
        const blank = [...bogeys] as (number | null)[]; blank[4] = null; blank[5] = 0;
        expect(ids(withHoles(blank))).toEqual([]);
    });

    it("보기 없는 9홀 — 전반이나 후반 아홉 홀을 다 파 이하로. 그 아홉 홀의 파를 다 알 때만", () => {
        const front = [...PAR.slice(0, 9), ...bogeys.slice(9)];
        expect(ids(withHoles(front))).toEqual(["clean-9"]);
        const back = [...bogeys.slice(0, 9), ...PAR.slice(9)];
        expect(ids(withHoles(back))).toEqual(["clean-9"]);
        const one = [...front]; one[8] = PAR[8] + 1;
        expect(ids(withHoles(one))).toEqual([]);
        const pars = [...PAR] as (number | null)[]; pars[0] = null;
        expect(ids(withHoles(front, pars))).toEqual([]);
        // 홀 타수가 없는 기록(옛 기록) · 칸 수가 틀린 기록
        expect(ids([round(0, 100, 72, { strokes: null, pars: PAR })])).toEqual([]);
        expect(ids([round(0, 100, 72, { strokes: PAR.slice(0, 9), pars: PAR })])).toEqual([]);
    });
});

describe("타수 핀", () => {
    const breaks = (r: PinRound[]) => ids(r).filter((x) => x.startsWith("break-"));

    it("정규 18홀에서 처음 그 타수 이하를 친 날 — 99 · 89 · 79", () => {
        expect(PIN_BREAK_MAX).toBe(99);
        expect(breaks([round(0, 100)])).toEqual([]);
        expect(breaks([round(0, 99)])).toEqual(["break-100"]);
        expect(breaks([round(0, 104), round(1, 89), round(2, 95)])).toEqual(["break-100", "break-90"]);
        expect(breaks([round(0, 78)])).toEqual(["break-100", "break-90", "break-80"]);
        // 처음 깬 날이 받은 날이다(나중에 더 잘 쳐도 그대로)
        expect(at([round(0, 104), round(3, 97), round(8, 91)], [], "break-100")).toBe(T0 + 3 * DAY);
    });

    it("총 파를 모르는 라운드 · 파3 코스(총 파 68 미만)는 세지 않는다 — 파3 18홀 70타가 '80 깨기'가 되지 않게", () => {
        expect(PIN_MIN_PAR).toBe(68);
        expect(breaks([round(0, 85, null)])).toEqual([]);
        expect(breaks([round(0, 70, 54)])).toEqual([]);
        expect(breaks([round(0, 70, 67)])).toEqual([]);
        expect(breaks([round(0, 88, 68)])).toEqual(["break-100", "break-90"]);
        expect(breaks([round(0, null), round(1, 0)])).toEqual([]);
    });
});

describe("동반자 · 사진", () => {
    it("풀조 — 같은 라운드에서 나 말고 셋이 인증 기록을 받았다(같은 사람을 두 번 세지 않는다)", () => {
        expect(has([round(0, 104, 72, { mates: ["a", "b", "c"] })], "full-group")).toBe(true);
        expect(has([round(0, 104, 72, { mates: ["a", "b"] })], "full-group")).toBe(false);
        expect(has([round(0, 104, 72, { mates: ["a", "a", "b"] })], "full-group")).toBe(false);
    });

    it("새 동반자 — 같이 인증 라운드를 끝낸 회원이 열 명이 된 라운드", () => {
        expect(PIN_COMPANIONS).toBe(10);
        const r = [round(0, 104, 72, { mates: ["a", "b", "c"] }), round(1, 104, 72, { mates: ["a", "d", "e"] }), round(2, 104, 72, { mates: ["f", "g", "h"] }), round(3, 104, 72, { mates: ["a", "i"] }), round(4, 104, 72, { mates: ["j"] })];
        expect(has(r.slice(0, 4), "companions-10")).toBe(false);
        expect(at(r, [], "companions-10")).toBe(T0 + 4 * DAY);
    });

    it("라운드 사진 — 열 번째 사진을 올린 때", () => {
        expect(PIN_PHOTOS).toBe(10);
        const shots = Array.from({ length: 10 }, (_, i) => T0 + i * HOUR);
        expect(has([], "photos-10", [], shots.slice(0, 9))).toBe(false);
        expect(at([], [], "photos-10", [...shots].reverse())).toBe(T0 + 9 * HOUR);
    });
});

describe("도장으로 받는 핀", () => {
    const open = STAMP_BOOKS.filter((b) => b.kind === "open");

    it("전국 한 바퀴 — '누구나' 일곱 권역에 도장이 하나씩. 받은 날은 마지막 권역을 처음 찍은 날", () => {
        const six = open.slice(0, 6).map((b, i) => stamp(b.id, 0, i));
        expect(ids([], six)).toEqual(["first-stamp"]);
        const all = [...six, stamp(open[6].id, 1, 40), stamp(open[6].id, 0, 44)];
        expect(ids([], all)).toEqual(["first-stamp", "tour-korea"]);
        expect(at([], all, "tour-korea")).toBe(T0 + 40 * DAY);
        expect(open).toHaveLength(7);
    });

    it("첫 초대 — 초대장(회원제) 도장첩의 첫 도장. 한 권역을 여러 번 찍는다고 전국 한 바퀴가 되지 않는다", () => {
        const invite = STAMP_BOOKS.find((b) => b.kind === "invite")!;
        const s = [stamp("gangwon", 0, 1), stamp("gangwon", 1, 2), stamp("gangwon", 2, 3), stamp(invite.id, 3, 9)];
        expect(ids([], s)).toEqual(["first-stamp", "first-invite"]);
        expect(at([], s, "first-invite")).toBe(T0 + 9 * DAY);
    });
});

describe("판정에 쓰는 자료 — 인증 라운드만", () => {
    const repo = read("server/storage/golf.repo.ts");
    const fn = repo.slice(repo.indexOf("async getGolfPinRounds(memberId: string)"), repo.indexOf("private async nudgeStampOneLeft("));

    it("집에서 적은 기록은 넘기지 않는다 — 동반자도 인증 기록을 받은 회원만", () => {
        expect(fn).toContain("const verified = rows.filter((r) => countsOnSite(r.onSite));");
        expect(fn).toContain("if (!o.sessionId || o.memberId === memberId || !countsOnSite(o.onSite)) continue;");
    });

    it("총 파는 18홀을 다 알 때만, 홀의 파는 아는 홀만 — 기본값(파 4)으로 판정하지 않는다", () => {
        expect(fn).toContain("const all = cp.known.length === 18 && cp.known.every(Boolean);");
        expect(fn).toContain("pars: cp.pars.map((v, k) => (cp.known[k] ? v : null)),");
        // 시작한 때는 경기의 started_at — 방을 만든 때(created_at)로 대신하지 않는다
        expect(fn).toContain("startAt: s.startedAt ?? null,");
        expect(fn).not.toContain("createdAt: golfMatchSessions.createdAt");
    });

    it("사진은 가려진 것을 빼고 센다. 사진 표가 아직 없으면 빈 목록", () => {
        expect(fn).toContain("isNull(golfRoundPhotos.hiddenAt)");
        expect(fn).toContain('=== "42P01"');
    });

    it("도장첩의 기록과 같은 곳에서 같이 적는다 — 읽다 실패해도 도장첩의 기록은 적는다. 열 번째 사진을 올린 순간에도 맞춘다", () => {
        const sync = repo.slice(repo.indexOf("async syncStampAwards(memberId: string)"), repo.indexOf("async getGolfPinRounds(memberId: string)"));
        // 받을 때는 읽기 실패를 빈 값으로(strict false) — 어드민 맞춰 보기(golfAwardsDue)만 던진다(2026-10-17 골프 ③에서 판정을 한 함수로 뽑음)
        expect(sync).toContain("const { stamps, pins, extra } = await this.stampAwardInputs(memberId, false);");
        expect(sync).toContain('const soft = <T,>(label: string, empty: T) => (e: unknown): T => { if (strict) throw e; console.error(`[golf] ${label}`, e); return empty; };');
        expect(sync).toContain('this.getGolfPinRounds(memberId).catch(soft("pinRounds", [] as PinRound[])),');
        expect(sync).toContain("const pins = pinsDue(rounds, stamps, shots, golds);");
        expect(sync).toContain("const fresh = await syncStampAwards(memberId, stamps, pins, extra);");
        const routes = read("server/routes/modules/golf.ts");
        expect(routes).toContain("if (shots.length === PIN_PHOTOS) await Promise.race([storage.golf.syncStampAwards(req.userId!), new Promise((r) => setTimeout(r, 2000))]);");
    });
});
