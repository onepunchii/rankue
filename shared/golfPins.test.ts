import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_BOOKS } from "./golfStampBooks";
import type { DatedStamp } from "./golfStampAwards";
import { GOLF_PINS, PIN_BREAK_MAX, PIN_MIN_PAR, golfPin, pinsDue, type PinRound } from "./golfPins";

/**
 * 업적 핀 1차(2026-10-12) — 지금 자료로 틀림없이 판정되는 아홉 개. 적는 길(같은 표 · 순번)은 server/storage/golfStampAwards.test.ts.
 */
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const T0 = Date.UTC(2026, 2, 1, 3, 0), DAY = 86_400_000;
const round = (i: number, score: number | null = 104, par: number | null = 72): PinRound => ({ at: T0 + i * DAY, score, par });
const rounds = (n: number) => Array.from({ length: n }, (_, i) => round(i));
const book = (id: string) => STAMP_BOOKS.find((b) => b.id === id)!;
const stamp = (bookId: string, i: number, day: number): DatedStamp => { const s = book(bookId).slots[i]; return { clubId: s.clubIds[0], name: s.ledgerNames[0], firstDate: new Date(T0 + day * DAY) }; };
const ids = (r: PinRound[], s: DatedStamp[] = []) => pinsDue(r, s).map((p) => p.id);
const at = (r: PinRound[], s: DatedStamp[], id: string) => pinsDue(r, s).find((p) => p.id === id)?.earnedAt;

describe("목록", () => {
    it("아홉 개 — 이름표가 겹치지 않고, 그림 파일이 다 있다. 타수 핀 셋만 숫자를 얹는다", () => {
        expect(GOLF_PINS).toHaveLength(9);
        expect(new Set(GOLF_PINS.map((p) => p.id)).size).toBe(9);
        for (const p of GOLF_PINS) {
            expect(existsSync(resolve(root, `client/public/golf/stamp-art/${p.art}.webp`)), p.art).toBe(true);
            expect(golfPin(p.id)).toBe(p);
        }
        expect(GOLF_PINS.filter((p) => p.num).map((p) => [p.id, p.num])).toEqual([["break-100", "100"], ["break-90", "90"], ["break-80", "80"]]);
        const plate = code(read("client/src/golf/stamps/pinArt.ts"));
        for (const p of GOLF_PINS.filter((x) => x.num)) expect(plate, p.art).toContain(`"${p.art}": {`);
    });

    it("조건의 글에 돈 · 내기 · 술 이야기가 없다", () => {
        for (const p of GOLF_PINS) expect(`${p.name} ${p.how}`, p.id).not.toMatch(/원\b|내기|상금|술|맥주|소주|만원/);
    });
});

describe("라운드 수 · 첫 도장", () => {
    it("인증 라운드 N 번째를 끝낸 날 — 10 · 50 · 100", () => {
        expect(ids(rounds(9))).toEqual([]);
        expect(ids(rounds(10))).toEqual(["rounds-10"]);
        expect(ids(rounds(100))).toEqual(["rounds-10", "rounds-50", "rounds-100"]);
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

describe("타수 핀", () => {
    it("정규 18홀에서 처음 그 타수 이하를 친 날 — 99 · 89 · 79", () => {
        expect(PIN_BREAK_MAX).toBe(99);
        expect(ids([round(0, 100)])).toEqual([]);
        expect(ids([round(0, 99)])).toEqual(["break-100"]);
        expect(ids([round(0, 104), round(1, 89), round(2, 95)])).toEqual(["break-100", "break-90"]);
        expect(ids([round(0, 78)])).toEqual(["break-100", "break-90", "break-80"]);
        // 처음 깬 날이 받은 날이다(나중에 더 잘 쳐도 그대로)
        expect(at([round(0, 104), round(3, 97), round(8, 91)], [], "break-100")).toBe(T0 + 3 * DAY);
    });

    it("총 파를 모르는 라운드 · 파3 코스(총 파 68 미만)는 세지 않는다 — 파3 18홀 70타가 '80 깨기'가 되지 않게", () => {
        expect(PIN_MIN_PAR).toBe(68);
        expect(ids([round(0, 85, null)])).toEqual([]);
        expect(ids([round(0, 70, 54)])).toEqual([]);
        expect(ids([round(0, 70, 67)])).toEqual([]);
        expect(ids([round(0, 88, 68)])).toEqual(["break-100", "break-90"]);
        // 타수가 없거나 0 인 기록
        expect(ids([round(0, null), round(1, 0)])).toEqual([]);
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

describe("판정에 쓰는 자료 — 인증 라운드만, 총 파는 18홀을 다 알 때만", () => {
    const repo = code(read("server/storage/golf.repo.ts"));
    const fn = repo.slice(repo.indexOf("async getGolfPinRounds(memberId: string)"), repo.indexOf("private async nudgeStampOneLeft("));

    it("집에서 적은 기록은 넘기지 않는다", () => {
        expect(fn).toContain("const verified = rows.filter((r) => countsOnSite(r.onSite));");
        expect(fn).toContain("return verified.map((r) => ({ at: r.createdAt, score: r.score, par:");
    });

    it("총 파는 타수 핀의 후보(99타 이하)에만 찾는다. 한 홀이라도 파를 모르면 모르는 것이다", () => {
        expect(fn).toContain("r.score > 0 && r.score <= PIN_BREAK_MAX && r.sessionId");
        expect(fn).toContain("pars[i].known.length === 18 && pars[i].known.every(Boolean)");
        expect(fn).toContain("if (ids.length > 0) {");
    });

    it("도장첩의 기록과 같은 곳에서 같이 적는다 — 읽다 실패해도 도장첩의 기록은 적는다", () => {
        const sync = repo.slice(repo.indexOf("async syncStampAwards(memberId: string)"), repo.indexOf("async getGolfPinRounds(memberId: string)"));
        expect(sync).toContain('const pins = pinsDue(await this.getGolfPinRounds(memberId).catch((e) => { console.error("[golf] pinRounds", e); return [] as PinRound[]; }), stamps);');
        expect(sync).toContain("const fresh = await syncStampAwards(memberId, stamps, pins);");
    });
});
