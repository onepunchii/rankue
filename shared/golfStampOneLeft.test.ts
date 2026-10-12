import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_BOOKS, bookStates } from "./golfStampBooks";
import type { DatedStamp } from "./golfStampAwards";
import { ONE_LEFT_FRESH_MS, ONE_LEFT_TYPE, lastEmptySlot, oneLeftFresh, oneLeftKey, oneLeftNotice, oneLeftUrl, stampOneLeft } from "./golfStampOneLeft";
import { notifGroup } from "./notificationGroup";
import { prefKeyFor } from "./notificationPrefs";

/**
 * 도장첩 '한 곳 남음'(2026-10-12) — 무엇을 · 언제 알리는가. 보내는 길(밤 · 한 번만 · 부르는 곳)은 server/services/golfStampOneLeft.test.ts.
 */
const T0 = Date.UTC(2026, 9, 1, 3, 0);
const DAY = 86_400_000;
const book = (id: string) => STAMP_BOOKS.find((b) => b.id === id)!;
/** 그 권의 앞에서 n 칸을 하루 간격으로 찍는다 */
const fill = (id: string, n: number, from = 0): DatedStamp[] => book(id).slots.slice(0, n).map((s, i) => ({ clubId: s.clubIds[0], name: s.ledgerNames[0], firstDate: new Date(T0 + (from + i) * DAY) }));

describe("한 칸 남은 권", () => {
    it("'누구나' 권에서 빈 칸이 딱 하나일 때 — 그 마지막 칸과, 그 권에서 가장 늦은 도장의 때", () => {
        const g = book("gangwon");
        const got = stampOneLeft(fill("gangwon", g.slots.length - 1));
        expect(got).toHaveLength(1);
        const last = g.slots[g.slots.length - 1];
        expect(got[0]).toMatchObject({ bookId: "gangwon", bookName: g.name, slotKey: last.key, slotName: last.name, courseId: last.courseId, got: g.slots.length - 1, total: g.slots.length });
        expect(got[0].lastAt).toBe(T0 + (g.slots.length - 2) * DAY);
    });

    it("두 칸 넘게 남았거나 다 채웠으면 아니다", () => {
        const n = book("gangwon").slots.length;
        expect(stampOneLeft(fill("gangwon", n - 2))).toEqual([]);
        expect(stampOneLeft(fill("gangwon", n))).toEqual([]);
        expect(stampOneLeft([])).toEqual([]);
    });

    it("초대장(회원제) 권은 재촉하지 않는다 — 한 칸 남아도 넣지 않는다", () => {
        for (const b of STAMP_BOOKS.filter((x) => x.kind === "invite")) {
            const stamps = fill(b.id, b.slots.length - 1);
            expect(stampOneLeft(stamps), b.id).toEqual([]);
            expect(lastEmptySlot(bookStates(stamps).find((s) => s.book.id === b.id)!)).toBeNull();
        }
    });

    it("남은 칸이 가운데여도 그 칸을 찾는다. 여러 권이 한 칸씩 남았으면 도장첩 순서로 전부", () => {
        const s = book("seohae"), c = book("chungcheong");
        const seohae = s.slots.filter((_, i) => i !== 1).map((x, i) => ({ clubId: x.clubIds[0], name: x.ledgerNames[0], firstDate: T0 + i * DAY }));
        const got = stampOneLeft([...fill("chungcheong", c.slots.length - 1, 10), ...seohae]);
        expect(got.map((o) => o.bookId)).toEqual(STAMP_BOOKS.filter((b) => b.id === "seohae" || b.id === "chungcheong").map((b) => b.id));
        expect(got.find((o) => o.bookId === "seohae")!.slotKey).toBe(s.slots[1].key);
    });

    it("화면(도장첩 한 권)과 같은 셈이다 — lastEmptySlot 이 가리키는 칸", () => {
        const stamps = fill("gangwon", book("gangwon").slots.length - 1);
        const st = bookStates(stamps).find((x) => x.book.id === "gangwon")!;
        expect(lastEmptySlot(st)!.slot.key).toBe(stampOneLeft(stamps)[0].slotKey);
        const page = readFileSync(resolve(__dirname, "../client/src/golf/pages/StampBook.tsx"), "utf8");
        // 예시에는 붙이지 않는다 · 누르면 그 골프장의 공개 페이지
        expect(page).toContain("const last = col.sample ? null : lastEmptySlot(state);");
        expect(page).toContain("href={`/golf/course/${last.slot.courseId}`}");
        expect(page).toContain('data-testid="stamp-one-left"');
    });
});

describe("언제 알리나", () => {
    const one = stampOneLeft(fill("gangwon", book("gangwon").slots.length - 1))[0];

    it("방금 한 칸 남았을 때만 — 그 권의 마지막 도장이 24시간 안", () => {
        expect(ONE_LEFT_FRESH_MS).toBe(24 * 3600_000);
        expect(oneLeftFresh([one], one.lastAt + 60_000)).toHaveLength(1);
        expect(oneLeftFresh([one], one.lastAt + ONE_LEFT_FRESH_MS)).toHaveLength(1);
        // 한참 전에 한 칸 남은 권을 다른 라운드를 끝낼 때마다 다시 알리지 않는다
        expect(oneLeftFresh([one], one.lastAt + ONE_LEFT_FRESH_MS + 1)).toEqual([]);
        // 앞날의 날짜(시계가 어긋난 기록)는 넣지 않는다
        expect(oneLeftFresh([one], one.lastAt - 1)).toEqual([]);
    });

    it("열쇠 · 가는 곳 · 글 — 권마다 한 번, 그 도장첩으로. 돈 · 내기 · 술 이야기가 없다", () => {
        expect(oneLeftKey("gangwon")).toBe("stamp-one-left:gangwon");
        expect(oneLeftUrl("gangwon")).toBe("/golf/stamps/gangwon");
        const t = oneLeftNotice(one);
        expect(t).toEqual({ title: `${one.bookName} 도장첩, 한 곳 남았어요`, body: `${one.slotName}만 찍으면 ${one.bookName} 볼마커를 받아요.`, url: "/golf/stamps/gangwon" });
        expect(`${t.title} ${t.body}`).not.toMatch(/원\b|내기|상금|술|맥주|소주|\d+만/);
    });

    it("알림함에서는 소식 묶음, 설정에서는 골프 소식 칸 — 긴급 · 관심 · 조인 칸을 타지 않는다", () => {
        expect(ONE_LEFT_TYPE).toBe("GOLF_STAMP");
        expect(notifGroup(ONE_LEFT_TYPE, { url: oneLeftUrl("gangwon") })).toBe("notice");
        const pref = prefKeyFor("GOLF", ONE_LEFT_TYPE, { url: oneLeftUrl("gangwon") });
        expect(pref.startsWith("golf_")).toBe(true);
        expect(["golf_urgent", "golf_watch", "golf_join", "golf_chat", "golf_crew"]).not.toContain(pref);
    });
});
