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

    it("붙인 곳: 친구 목록 · 최근 상대 · 채팅 말풍선 · 채팅 목록 — 사진 상자(overflow-hidden) 바깥의 relative 상자에", () => {
        const friends = read("client/src/components/hiq/rivals/FriendList.tsx");
        expect(friends).toContain('{currentSport !== "GOLF" && simTiers[friend.id] ? (');
        expect(friends).toContain('<TierAvatarBadge memberId={friend.id} size={26} className="-bottom-2 -right-2" />');
        const recent = read("client/src/components/hiq/rivals/RecentOpponents.tsx");
        expect(recent).toContain('<div className="relative shrink-0">');
        expect(recent).toContain("<TierAvatarBadge memberId={opponent.id}");
        const chat = read("client/src/components/hiq/chat/ChatRoom.tsx");
        expect(chat).toContain('<span className={cn("relative shrink-0", grouped && "invisible")}>');
        expect(chat).toContain("<TierAvatarBadge memberId={m.senderId}");
        // 채팅 목록: 1:1 방의 상대만(서버가 peerId 를 싣는다 — 여럿이 있는 방은 없다)
        expect(read("client/src/pages/hiq/chat-hub.tsx")).toContain('{r.kind === "dm" && <TierAvatarBadge memberId={r.peerId}');
        expect(read("server/storage/chat.repo.ts")).toContain("peerId: others.length === 1 ? others[0].id : null,");
    });
});

/**
 * 크루 · 커뮤니티(2026-10-12 오너: "크루랑 커뮤니티도 붙여주고").
 * 크루 화면은 공용 사진(CrewAvatar)에 memberId 를 주면 배지가 붙는다. 커뮤니티는 글쓴이 · 댓글 쓴 사람의 사진 옆.
 */
describe("크루 · 커뮤니티의 배지", () => {
    it("공용 사진(CrewAvatar): memberId 를 줄 때만 바깥 상자와 배지가 생긴다 — 안 주면 예전 그대로", () => {
        const ui = read("client/src/components/hiq/crew-ui/index.tsx");
        expect(ui).toContain("if (!memberId) return face;");
        expect(ui).toContain('<span className="relative shrink-0 inline-flex" style={{ width: size, height: size }}>');
        expect(ui).toContain("<TierAvatarBadge memberId={memberId} size={Math.max(14, Math.round(size * 0.46))}");
    });

    it("크루: 멤버 목록 · 가입 관리 · 게시글과 댓글 · 사진과 댓글 · 모임 참가자 · 투표한 사람", () => {
        const list = read("client/src/components/hiq/CrewMemberList.tsx");
        expect(list).toContain("<TierAvatarBadge memberId={m.id} size={22}");
        // 한 사람을 크게 보여 주는 창에서는 글자로 밝힌다
        expect(list).toContain("<TierNameChip memberId={selectedMember.member.id}");
        expect(read("client/src/components/hiq/club-settings/ClubMemberTab.tsx").match(/memberId=\{m\.member\.id\}/g)).toHaveLength(2);
        expect(read("client/src/components/hiq/SocialPostCard.tsx")).toContain("memberId={post.authorId}");
        const post = read("client/src/components/hiq/PostDetailDialog.tsx");
        expect(post).toContain("memberId={post?.authorId}");
        expect(post).toContain("memberId={comment.authorId}");
        const photo = read("client/src/components/hiq/PhotoDetailDialog.tsx");
        expect(photo).toContain("memberId={photo.uploaderId}");
        expect(photo).toContain("memberId={comment.authorId}");
        expect(read("client/src/components/hiq/view/ClubActivityList.tsx")).toContain("memberId={p.memberId}");
        expect(read("client/src/components/hiq/poll/PollVotersSheet.tsx")).toContain("memberId={v.id}");
    });

    it("겹쳐 쌓는 작은 사진 줄에는 붙이지 않는다(배지가 옆 사진을 가린다)", () => {
        const acts = read("client/src/components/hiq/view/ClubActivityList.tsx");
        const stacked = acts.split("\n").find((l) => l.includes("<CrewAvatar key={p.memberId ?? idx}"))!;
        expect(stacked).toBeTruthy();
        expect(stacked).not.toContain("memberId={");
    });

    it("커뮤니티: 글쓴이와 댓글 쓴 사람 — 사진 상자 바깥의 relative 상자에", () => {
        const card = read("client/src/components/hiq/community/CommunityPostCard.tsx");
        expect(card).toContain("<TierAvatarBadge memberId={post.authorId}");
        const page = read("client/src/pages/hiq/community-post.tsx");
        expect(page).toContain("<TierAvatarBadge memberId={c.authorId}");
        expect(page).toContain('<div className="relative shrink-0 self-start">');
    });

    it("이름 한 줄(TierNameChip)도 등급이 없거나 골프 화면이면 그리지 않는다", () => {
        const badge = read("client/src/components/hiq/TierAvatarBadge.tsx");
        expect(badge.match(/if \(!tier \|\| currentSport === "GOLF"\) return null;/g)).toHaveLength(2);
    });
});
