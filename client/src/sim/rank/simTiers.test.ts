import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TIERS } from "../../../../shared/sim/rank";

/**
 * 프로필 사진 옆 등급 배지(2026-10-12 — 순서의 5번, 오너: "우리가 만든 티어를 채팅 사진 프로필이나 친구 프로필에 적용하고 싶은데").
 * 화면마다 서버 응답을 고치지 않고 등급 표 하나(GET /sim/tiers)를 받아 같이 쓴다.
 * 이 파일은 "@/…" 를 끌어오는 훅을 직접 부르지 않는다 — 파서는 같은 규칙으로 여기서 다시 확인하고, 나머지는 소스를 읽어 지킨다.
 */
const read = (f: string) => readFileSync(resolve(__dirname, "../../../..", f), "utf8");
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

describe("등급 표(simTiers)", () => {
    const src = read("client/src/sim/rank/simTiers.ts");

    it("아는 등급만 받는다 — 모르는 값 · 깨진 답은 그 사람만 빠진다", () => {
        // 파서의 규칙을 그대로 옮겨 본다(훅 파일은 '@/' 임포트 때문에 여기서 불러올 수 없다)
        const parse = (raw: unknown) => {
            const t = raw && typeof raw === "object" ? (raw as { tiers?: unknown }).tiers : null;
            if (!t || typeof t !== "object" || Array.isArray(t)) return {};
            const out: Record<string, string> = {};
            for (const [id, v] of Object.entries(t as Record<string, unknown>)) if (typeof v === "string" && TIERS.some((x) => x.id === v)) out[id] = v;
            return out;
        };
        expect(parse({ tiers: { a: "gold", b: "legend", c: 3, d: "iron" } })).toEqual({ a: "gold", d: "iron" });
        for (const bad of [null, undefined, "x", [], { tiers: null }, { tiers: [] }, { tiers: "gold" }]) expect(parse(bad)).toEqual({});
        // 소스가 같은 규칙이다
        expect(src).toContain('if (!t || typeof t !== "object" || Array.isArray(t)) return EMPTY;');
        expect(src).toContain('if (typeof v === "string" && TIERS.some((x) => x.id === v)) out[id] = v as TierId;');
    });

    it("로그인한 회원만 받고, 답은 몇 분 간직한다", () => {
        expect(code(src)).toContain("enabled: !!member,");
        expect(code(src)).toContain("staleTime: SIM_TIERS_STALE_MS,");
        expect(src).toContain("export const SIM_TIERS_STALE_MS = 5 * 60_000;");
    });

    it("서버: 배치를 마친 사람만 · 두 종목 중 높은 쪽 · 로그인 필수", () => {
        const repo = read("server/storage/sim.repo.ts");
        const fn = repo.slice(repo.indexOf("async placedRatings("), repo.indexOf("async getShots("));
        expect(fn).toContain("select r.member_id, max(r.rating) as rating");
        expect(fn).toContain("where r.matches >= ${placement}");
        expect(fn).toContain("group by r.member_id");
        const route = read("server/routes/modules/sim.ts");
        expect(route).toContain('router.get("/sim/tiers", requireAuth, asyncHandler(async (_req: AuthRequest, res: any) => {');
        expect(route).toContain("for (const r of rows) tiers[r.memberId] = tierFor(r.rating).id;");
    });
});

describe("사진 옆 배지(TierAvatarBadge)", () => {
    const badge = code(read("client/src/components/hiq/TierAvatarBadge.tsx"));

    it("등급이 없으면 아무것도 그리지 않는다 · 골프 화면에서는 그리지 않는다", () => {
        expect(badge).toContain('if (!tier || currentSport === "GOLF") return null;');
    });

    it("글자 없는 배지라 이름으로 밝힌다 — '온라인 대전 골드'(다섯 언어)", () => {
        expect(badge).toContain('t("sim.rank.badgeAria").replace("{tier}"');
        expect(badge).toContain("<TierEmblem tier={tier} size={size} label={name} />");
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const d = read(`client/src/lib/i18n/${l}.ts`);
            expect(d.match(/"sim\.rank\.badgeAria": "(.*)",/)![1], l).toContain("{tier}");
        }
    });

    it("누름을 가로채지 않는다(사진 줄 전체가 단추인 곳이 많다)", () => {
        expect(badge).toContain("pointer-events-none");
    });

    it("붙인 곳: 친구 목록 · 최근 상대 · 채팅 말풍선 — 사진 상자(overflow-hidden) 바깥의 relative 상자에", () => {
        const friends = read("client/src/components/hiq/rivals/FriendList.tsx");
        expect(friends).toContain('{currentSport !== "GOLF" && simTiers[friend.id] ? (');
        expect(friends).toContain('<TierAvatarBadge memberId={friend.id} size={26} className="-bottom-2 -right-2" />');
        const recent = read("client/src/components/hiq/rivals/RecentOpponents.tsx");
        expect(recent).toContain('<div className="relative shrink-0">');
        expect(recent).toContain("<TierAvatarBadge memberId={opponent.id}");
        const chat = read("client/src/components/hiq/chat/ChatRoom.tsx");
        expect(chat).toContain('<span className={cn("relative shrink-0", grouped && "invisible")}>');
        expect(chat).toContain("<TierAvatarBadge memberId={m.senderId}");
    });
});
