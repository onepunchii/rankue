import { describe, expect, it } from "vitest";
import { STAMP_BOOKS } from "./golfStampBooks";
import { stampAwardId, stampAwardsDue, type DatedStamp } from "./golfStampAwards";

/**
 * 도장첩에서 받는 것의 기록(2026-10-12) — 볼마커(권 · 누구나 전부)와 트로피를 '언제' 받았는지.
 * 서버는 이 계산에서 아직 안 적은 것만 golf_stamp_awards 에 더한다(받은 순번이 붙는다).
 */
const slot = (key: string) => STAMP_BOOKS.flatMap((b) => b.slots).find((s) => s.key === key)!;
const day = (n: number) => Date.UTC(2026, 0, 1) + n * 86_400_000;
const st = (key: string, n: number, which = 0): DatedStamp => ({ clubId: slot(key).clubIds[which], name: slot(key).ledgerNames[which], firstDate: new Date(day(n)) });
const keysOf = (bookId: string) => STAMP_BOOKS.find((b) => b.id === bookId)!.slots.map((s) => s.key);
const ids = (list: ReturnType<typeof stampAwardsDue>) => list.map((a) => stampAwardId(a.kind, a.key));

describe("받을 것", () => {
    it("도장이 없거나 권을 못 채웠으면 아무것도 없다", () => {
        expect(stampAwardsDue([])).toEqual([]);
        expect(stampAwardsDue(keysOf("gangwon").slice(0, 6).map((k, i) => st(k, i)))).toEqual([]);
    });

    it("한 권을 다 채우면 그 권의 볼마커 — 받은 때는 마지막 칸을 채운 도장의 날(찍은 순서와 상관없이)", () => {
        const keys = keysOf("chungcheong");
        // 가운데 칸을 가장 늦게 찍었다
        const due = stampAwardsDue([st(keys[0], 3), st(keys[1], 40), st(keys[2], 12)]);
        expect(due).toEqual([{ kind: "book", key: "chungcheong", earnedAt: day(40) }]);
    });

    it("트로피는 칸의 수로 — 열 번째 칸을 채운 날이 10곳 트로피를 받은 날", () => {
        const keys = [...keysOf("seohae"), ...keysOf("gangwon")].slice(0, 10);
        const nine = stampAwardsDue(keys.slice(0, 9).map((k, i) => st(k, i)));
        expect(ids(nine)).toEqual(["book:seohae"]);
        const ten = stampAwardsDue(keys.map((k, i) => st(k, i)));
        expect(ids(ten)).toEqual(["book:seohae", "trophy:10"]);
        expect(ten[1].earnedAt).toBe(day(9));
    });

    it("한 칸에 도장이 둘(원장에 두 줄인 골프장)이어도 한 칸이다 — 트로피 수가 늘지 않고, 그 칸의 날은 먼저 얻은 쪽", () => {
        const keys = keysOf("seohae");
        const stamps = [st("sky72", 50, 1), st("sky72", 5, 0), ...keys.filter((k) => k !== "sky72").map((k, i) => st(k, 10 + i))];
        const due = stampAwardsDue(stamps);
        expect(due).toEqual([{ kind: "book", key: "seohae", earnedAt: day(12) }]);
    });

    it("누구나 일곱 권을 전부 채우면 큰 볼마커 — 초대장은 상관없다. 그때 트로피는 30곳까지", () => {
        const open = STAMP_BOOKS.filter((b) => b.kind === "open").flatMap((b) => b.slots.map((s) => s.key));
        const due = stampAwardsDue(open.map((k, i) => st(k, i)));
        expect(ids(due).filter((x) => x.startsWith("all"))).toEqual(["all:all-open"]);
        expect(due.find((a) => a.kind === "all")!.earnedAt).toBe(day(35));
        expect(ids(due).filter((x) => x.startsWith("trophy"))).toEqual(["trophy:10", "trophy:20", "trophy:30"]);
        expect(ids(due).filter((x) => x.startsWith("book")).length).toBe(7);
        // 하나가 빠지면 큰 볼마커는 없다
        expect(ids(stampAwardsDue(open.slice(1).map((k, i) => st(k, i)))).some((x) => x.startsWith("all"))).toBe(false);
    });

    it("쉰여섯 칸을 다 채우면 볼마커 열(권 아홉 + 전부) · 트로피 다섯 — 받은 순서로 나온다", () => {
        const all = STAMP_BOOKS.flatMap((b) => b.slots.map((s) => s.key));
        const due = stampAwardsDue(all.map((k, i) => st(k, i)));
        expect(due.filter((a) => a.kind === "book").length).toBe(9);
        expect(due.filter((a) => a.kind === "all").length).toBe(1);
        expect(due.filter((a) => a.kind === "trophy").map((a) => a.key)).toEqual(["10", "20", "30", "45", "56"]);
        const times = due.map((a) => a.earnedAt);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
        // 이름표는 겹치지 않는다
        expect(new Set(ids(due)).size).toBe(due.length);
    });

    it("명단 밖의 골프장 · 날짜를 못 읽는 도장은 세지 않는다. 날짜는 Date · 글자 · 숫자를 다 받는다", () => {
        const keys = keysOf("yeongnam");
        const due = stampAwardsDue([
            { clubId: "00000000-0000-4000-8000-000000000000", name: "동네 골프장", firstDate: new Date(day(1)) },
            { clubId: slot(keys[0]).clubIds[0], name: "x", firstDate: new Date(day(2)).toISOString() },
            { clubId: slot(keys[1]).clubIds[0], name: "x", firstDate: day(3) },
            { clubId: slot(keys[2]).clubIds[0], name: "x", firstDate: new Date(day(4)) },
            { clubId: slot("paju").clubIds[0], name: "x", firstDate: "날짜 아님" },
        ]);
        expect(due).toEqual([{ kind: "book", key: "yeongnam", earnedAt: day(4) }]);
    });
});
