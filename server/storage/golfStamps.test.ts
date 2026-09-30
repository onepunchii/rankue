import { describe, expect, it } from "vitest";
import { collectStamps, makeStampResolver, type StampRow } from "./golfStamps";

const clubs = [
    { id: "c1", name: "동강시스타 CC", region: "강원", address: null },
    { id: "c2", name: "H1", region: "경기남부", address: null },
    { id: "c3", name: "h1", region: "경기", address: null }, // 같은 이름(대소문자만 다름) — 먼저 나온 c2 가 이긴다
];

describe("makeStampResolver — 여권·발자국 공용 도장 규칙", () => {
    const resolve = makeStampResolver(clubs);

    it("골프장 번호가 먼저", () => {
        expect(resolve({ golfClubId: "c1", locationName: "엉뚱한 이름" })?.key).toBe("c1");
    });
    it("번호가 없거나 모르면 이름(공백·대소문자 무시)으로", () => {
        expect(resolve({ golfClubId: null, locationName: "동강 시스타cc" })?.club?.id).toBe("c1");
        expect(resolve({ golfClubId: "zzz", locationName: "H 1" })?.club?.id).toBe("c2");
    });
    it("원장에 없는 이름은 이름 도장(name:)으로 남는다", () => {
        const hit = resolve({ golfClubId: null, locationName: "옛날 골프장" });
        expect(hit?.key).toBe("name:옛날골프장");
        expect(hit?.club).toBeNull();
        expect(hit?.name).toBe("옛날 골프장");
    });
    it("골프장을 모르는 기록은 도장이 아니다", () => {
        expect(resolve({ golfClubId: null, locationName: null })).toBeNull();
        expect(resolve({ golfClubId: null, locationName: "알 수 없는 구장" })).toBeNull();
    });
});

// 현장 인증(2026-09-30) — 여권·발자국·Elite 60 이 같은 셈을 쓴다. 옛 기록(NULL)은 인정, false 만 기록 도장.
describe("collectStamps — 인증 도장 · 기록 도장", () => {
    const resolve = makeStampResolver(clubs);
    const row = (golfClubId: string | null, day: number, onSite: boolean | null, score = 90, locationName: string | null = null): StampRow =>
        ({ golfClubId, locationName, score, createdAt: new Date(Date.UTC(2026, 8, day)), onSite });

    it("오늘 이전 기록(on_site NULL)은 그대로 인증 도장 — 옛 도장이 사라지지 않는다", () => {
        const s = collectStamps([row("c1", 1, null), row("c2", 2, null)], resolve);
        expect(s.map((x) => [x.key, x.onSite])).toEqual([["c1", true], ["c2", true]]);
    });

    it("인증 못 받은 라운드뿐인 골프장은 기록 도장(점수·라운드 수는 그대로)", () => {
        const [s] = collectStamps([row("c1", 3, false, 88), row("c1", 5, false, 84)], resolve);
        expect(s.onSite).toBe(false);
        expect(s.rounds).toBe(2);
        expect(s.bestScore).toBe(84);
        expect(s.first.getUTCDate()).toBe(3);
    });

    it("한 번이라도 인증되면 인증 도장 — 날짜는 인증으로 센 첫 라운드, 라운드 수·베스트는 전부", () => {
        const [s] = collectStamps([row("c1", 3, false, 79), row("c1", 9, true, 92), row("c1", 12, false, 95)], resolve);
        expect(s.onSite).toBe(true);
        expect(s.first.getUTCDate()).toBe(9);
        expect(s.last.getUTCDate()).toBe(12);
        expect(s.rounds).toBe(3);
        expect(s.bestScore).toBe(79);
    });

    it("도장을 얻은 순서로 줄 선다 — 기록 도장이 먼저 있어도 인증한 날로", () => {
        const s = collectStamps([row("c1", 1, false), row("c2", 4, true), row("c1", 7, true)], resolve);
        expect(s.map((x) => x.key)).toEqual(["c2", "c1"]);
    });

    it("골프장을 모르는 기록은 도장이 없다(라운드 수에만)", () => {
        expect(collectStamps([row(null, 1, true, 90, null), row(null, 2, null, 90, "알 수 없는 구장")], resolve)).toEqual([]);
    });
});
