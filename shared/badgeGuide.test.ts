import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { onlineTierRanges, realTierRanges } from "./badgeGuide";
import { realHandiSteps, realTierFor } from "./realTier";
import { TIERS, tierFor } from "./sim/rank";

/**
 * 배지 안내 팝업(2026-10-12 오너: "이거 누르면 팝업창으로 배지 나오면서 무슨 배지가 있고 간략하게 보여주는 팝업창 필요해 · 온라인게임 배지랑 실전 배지 다").
 * 구간의 숫자는 규칙에서 읽는다 — 팝업에 따로 적지 않는다.
 */
describe("실전 등급의 다마 구간", () => {
    it("3쿠션: 브론즈 12~17 · 실버 18 · 골드 20~22 · 플래티넘 23~24 · 다이아 25~28 · 마스터 30 이상", () => {
        expect(realTierRanges("3c")).toEqual([
            { id: "bronze", from: 12, to: 17 }, { id: "silver", from: 18, to: 18 }, { id: "gold", from: 20, to: 22 },
            { id: "platinum", from: 23, to: 24 }, { id: "diamond", from: 25, to: 28 }, { id: "master", from: 30, to: null },
        ]);
    });

    it("4구: 브론즈 3~10 · 실버 12~15 · 골드 20~25 · 플래티넘 30 · 다이아 40 · 마스터 50 이상", () => {
        expect(realTierRanges("4c")).toEqual([
            { id: "bronze", from: 3, to: 10 }, { id: "silver", from: 12, to: 15 }, { id: "gold", from: 20, to: 25 },
            { id: "platinum", from: 30, to: 30 }, { id: "diamond", from: 40, to: 40 }, { id: "master", from: 50, to: null },
        ]);
    });

    it("구간의 시작 다마가 정말 그 등급이다 — 메달 그림에 그 숫자를 얹어 보여 준다", () => {
        for (const g of ["3c", "4c"] as const) {
            for (const r of realTierRanges(g)) {
                expect(realTierFor(r.from, g)!.id, `${g} ${r.from}`).toBe(r.id);
                if (r.to !== null) expect(realTierFor(r.to, g)!.id, `${g} ${r.to}`).toBe(r.id);
                expect(realHandiSteps(g)).toContain(r.from);
            }
        }
    });
});

describe("온라인 대전 등급의 레이팅 구간", () => {
    it("아이언 950 미만부터 마스터 1450 이상까지 — 빈틈 없이 이어진다", () => {
        const r = onlineTierRanges();
        expect(r.map((x) => x.id)).toEqual(TIERS.map((t) => t.id));
        expect(r[0]).toEqual({ id: "iron", from: null, to: 949 });
        expect(r[r.length - 1]).toEqual({ id: "master", from: 1450, to: null });
        for (let i = 1; i < r.length; i++) expect(r[i].from).toBe((r[i - 1].to as number) + 1);
        for (const x of r) {
            if (x.from !== null) expect(tierFor(x.from).id).toBe(x.id);
            if (x.to !== null) expect(tierFor(x.to).id).toBe(x.id);
        }
    });
});

describe("화면: 배지를 누르면 안내가 뜬다", () => {
    const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
    const client = (p: string) => read(`client/src/${p}`);
    const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

    it("팝업은 앱에 하나 — 훅이 아닌 곳에서도 연다(openBadgeGuide)", () => {
        expect(client("App.tsx")).toContain("<BadgeGuideHost />");
        const sheet = code(client("components/hiq/BadgeGuideSheet.tsx"));
        expect(sheet).toContain("export function openBadgeGuide(opts: BadgeGuideOptions): void { setState({ open: true, opts }); }");
        // 기기의 '뒤로'가 팝업부터 닫는다
        expect(sheet).toContain("useBackToClose(s.open, closeBadgeGuide);");
    });

    it("탭 둘(실전 · 온라인)이고, 구간의 숫자는 규칙에서 읽는다 — 팝업에 다마 · 레이팅 숫자를 따로 적지 않는다", () => {
        const sheet = code(client("components/hiq/BadgeGuideSheet.tsx"));
        expect(sheet).toContain('(["real", "online"] as const).map((k) => (');
        expect(sheet).toContain("{realTierRanges(game).map((r) => row(r.id,");
        expect(sheet).toContain("{onlineTierRanges().map((r) => row(r.id,");
        expect(sheet).not.toMatch(/\b(950|1050|1150|1250|1350|1450)\b/);
        // 그 밖의 배지 넷 — 온라인 다마수 · 이달의 랭킹 메달 · 월대회 메달 · 달마다 받는 등급 배지
        expect([...sheet.matchAll(/\{ k: "(\w+)", art:/g)].map((m) => m[1])).toEqual(["dama", "month", "cup", "tier"]);
        // 장식장으로 가는 길은 회원에게만
        expect(sheet).toContain("{member && (");
    });

    it("누를 수 있는 배지: 홈 내 실력의 실전 메달 · 온라인 등급 방패 · 온라인 다마, 큐 케이스 허브의 등급 방패, 기록 화면의 실전 메달", () => {
        const skill = client("components/hiq/dashboard/HomeSkillCard.tsx");
        expect(skill).toContain('<BadgeTap guide={{ kind: "real", game: cur, handi: ready ? side!.handi : null }}>');
        expect(skill).toContain('<BadgeTap guide={s.kind === "ranked" ? { kind: "online", tier: s.tier.id, rating: s.rating } : { kind: "online", tier: null }}>');
        expect(skill).toContain('<BadgeTap guide={{ kind: "online", dama: onlineDama }}>');
        expect(client("components/hiq/cueCase/CueCaseHub.tsx")).toContain('<BadgeTap guide={{ kind: "online", tier: s.tier.id, rating: s.rating }}>');
        expect(client("components/hiq/dashboard/RealHandicapCard.tsx")).toContain('<BadgeTap guide={{ kind: "real", game: cur, handi: sideReady ? side.handi : null }}>');
    });

    it("배지가 다른 단추 안에 있어도 된다 — span 으로 그리고 눌림이 바깥으로 번지지 않게 막는다", () => {
        const sheet = code(client("components/hiq/BadgeGuideSheet.tsx"));
        const tap = sheet.slice(sheet.indexOf("export function BadgeTap("), sheet.indexOf("const seg ="));
        expect(tap).toContain('role="button" tabIndex={0}');
        expect(tap).toContain("e.preventDefault(); e.stopPropagation(); openBadgeGuide(guide);");
        expect(tap).toContain('if (e.key === "Enter" || e.key === " ") open(e);');
        expect(tap).not.toContain("<button");
        // 누른 것은 방문자 발자국에 한 이름으로 남는다(배지 안의 숫자 · 이름이 글자로 남지 않게)
        expect(tap).toContain('data-track-as="배지 안내 열기"');
    });

    it("문구가 다섯 언어에 있고 자리 표시를 지킨다", () => {
        const need: Record<string, string[]> = {
            "badgeGuide.title": [], "badgeGuide.desc": [], "badgeGuide.open": [], "badgeGuide.tabReal": [], "badgeGuide.tabOnline": [],
            "badgeGuide.realSub": ["{game}", "{n}"], "badgeGuide.realNone": [], "badgeGuide.realList": [], "badgeGuide.realHow": [],
            "badgeGuide.handiRange": ["{a}", "{b}"], "badgeGuide.handiOne": ["{a}"], "badgeGuide.handiTop": ["{a}"],
            "badgeGuide.onlineOf": ["{tier}"], "badgeGuide.ratingNow": ["{n}"], "badgeGuide.onlineNone": ["{n}"], "badgeGuide.onlineList": [], "badgeGuide.onlineHow": ["{n}"],
            "badgeGuide.ratingRange": ["{a}", "{b}"], "badgeGuide.ratingTop": ["{a}"], "badgeGuide.ratingBelow": ["{a}"],
            "badgeGuide.damaTitle": ["{n}"], "badgeGuide.damaSub": [], "badgeGuide.more": [], "badgeGuide.moreDama": [], "badgeGuide.moreMonth": [], "badgeGuide.moreCup": [], "badgeGuide.moreTier": [], "badgeGuide.toShelf": [],
        };
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const d = client(`lib/i18n/${l}.ts`);
            for (const [k, ph] of Object.entries(need)) {
                const v = d.match(new RegExp(`^  "${k.replace(/\./g, "\\.")}": "(.*)",$`, "m"))?.[1];
                expect(v, `${l} ${k}`).toBeTruthy();
                for (const p of ph) expect(v, `${l} ${k}`).toContain(p);
            }
        }
    });
});
