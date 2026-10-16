import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { INVITE_ALPHABET, claimRefusal, cleanInviteCode, inviteUrl, parseInviteMark, randomInviteCode } from "./invite";
import { CASE_ITEMS, INVITE_PICK_EVERY, INVITE_PICK_LIMIT, INVITE_STEPS, caseItem, invitePicks } from "./cueCase";
import { evaluateCase } from "./cueCaseRules";

const read = (p: string) => fs.readFileSync(p, "utf8");
const DAY = 86_400_000;

describe("친구 초대 — 코드", () => {
    it("여섯 글자 · 헷갈리는 0 O 1 I 없음 · 넣은 글자를 다듬는다", () => {
        expect(INVITE_ALPHABET).not.toMatch(/[0O1I]/);
        const c = randomInviteCode(() => 0.5);
        expect(c).toHaveLength(6);
        expect(cleanInviteCode(" k7q-x2m ")).toBe("K7QX2M");
        expect(cleanInviteCode("K7QX2")).toBeNull();
        expect(cleanInviteCode("K7QX2O")).toBeNull();
        expect(inviteUrl("K7QX2M")).toBe("https://www.rankue.co.kr/i/K7QX2M");
    });
    it("링크 표시 — 30일이 지나거나 꼴이 틀리면 버린다", () => {
        const now = 1_800_000_000_000;
        expect(parseInviteMark(JSON.stringify({ code: "K7QX2M", at: now - DAY }), now)).toEqual({ code: "K7QX2M", at: now - DAY });
        expect(parseInviteMark(JSON.stringify({ code: "K7QX2M", at: now - 31 * DAY }), now)).toBeNull();
        expect(parseInviteMark("{", now)).toBeNull();
    });
});

describe("친구 초대 — 셀 수 있는가(가입만 센다 · 새 계정만)", () => {
    const now = 1_800_000_000_000, base = { meId: "me", inviterId: "you", myJoinedAt: now - DAY, inviterJoinedAt: now - 100 * DAY, already: false, now };
    it("가입한 지 7일 안 · 처음 · 남의 코드면 센다", () => expect(claimRefusal(base)).toBeNull());
    it("없는 코드 · 내 코드 · 이미 · 오래된 계정 · 나보다 늦게 온 사람의 코드", () => {
        expect(claimRefusal({ ...base, inviterId: null })).toBe("code");
        expect(claimRefusal({ ...base, inviterId: "me" })).toBe("self");
        expect(claimRefusal({ ...base, already: true })).toBe("already");
        expect(claimRefusal({ ...base, myJoinedAt: now - 8 * DAY })).toBe("old");
        expect(claimRefusal({ ...base, inviterJoinedAt: now })).toBe("older");
    });
});

describe("친구 초대 — 보상", () => {
    it("1명 초크 · 3명 장갑 · 10명 큐 · 30명마다 한정 하나(12종 × 10자루) · 초대받은 사람 환영 초크", () => {
        expect(INVITE_STEPS).toEqual([1, 3, 10, 30]);
        expect(caseItem("chalk-invite")!.rule).toEqual({ k: "invite", n: 1 });
        expect(caseItem("glove-invite")!.rule).toEqual({ k: "invite", n: 3 });
        expect(caseItem("cue-invite-10")!.rule).toEqual({ k: "invite", n: 10 });
        expect(caseItem("chalk-welcome")!.rule).toEqual({ k: "invited" });
        expect(CASE_ITEMS.filter((x) => x.rule.k === "invitePick")).toHaveLength(12);
        expect([INVITE_PICK_EVERY, INVITE_PICK_LIMIT]).toEqual([30, 10]);
        expect(invitePicks(29, 0)).toEqual({ total: 0, left: 0 });
        expect(invitePicks(61, 1)).toEqual({ total: 2, left: 1 });
    });
    it("판정 — 단계는 n 번째 가입 때, 고르는 한정은 판정으로 들어오지 않는다(막대만)", () => {
        const s = evaluateCase({ nowMs: 1e12, joinedAt: 0, country: "KR", cups: [], monthTops: [], cupEntries: [], realTier: null, online: [], real: [], invites: [5, 1, 3, 2], invitedAt: 7 });
        expect(s["chalk-invite"]).toMatchObject({ done: true, at: 1 });
        expect(s["glove-invite"]).toMatchObject({ done: true, at: 3 });
        expect(s["cue-invite-10"].done).toBe(false);
        expect(s["chalk-welcome"]).toMatchObject({ done: true, at: 7 });
        expect(s["cue-lt-inv-jelly"]).toMatchObject({ done: false, bars: [{ have: 4, need: 30 }] });
    });
});

describe("친구 초대 — 서버 · 화면", () => {
    const route = read("server/routes/modules/invite.ts");
    it("초대로 센 가입은 한 사람 한 번(invitee 가 열쇠) · 더하기만", () => {
        expect(route).toContain("on conflict (invitee_id) do nothing returning invitee_id");
        const m = read("migrations/invite.sql").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        expect(m).toContain("invitee_id uuid primary key");
        expect(m).not.toMatch(/\b(drop|delete|truncate|update)\b/i);
    });
    it("고르기는 남은 수 · 가진 디자인 · 완판을 서버가 막는다", () => {
        const repo = read("server/storage/cueCase.repo.ts");
        expect(repo).toContain('if (invitePicks(invites.length, used).left <= 0) return { ok: false, reason: "none" };');
        expect(repo).toContain('if (!w) return { ok: false, reason: "soldOut" };');
    });
    it("링크로 온 비로그인에게는 설치 팝업이 가입까지 쉰다(앱에서 가입하면 표시가 끊긴다) · 봇에게는 미리보기", () => {
        expect(read("client/src/components/hiq/AppInstallSheet.tsx")).toContain("(!live.current.loggedIn && (!!joinStoreSlug() || !!readInviteMark()))");
        expect(read("server/prerender.ts")).toContain('app.get("/i/:code"');
        expect(read("vercel.json")).toContain("(?:store|club|r|i)/[^/]+");
        expect(read("client/src/App.tsx")).toContain('<Route path="/i/:code" component={InviteRoute} />');
    });
});

describe("친구 초대 — 다듬기(2026-10-16 저녁)", () => {
    it("고른 순간은 번호판까지 · 홈에서 초대 칸으로 바로 · 안내는 한 번", () => {
        const panel = read("client/src/components/hiq/invite/InvitePanel.tsx");
        expect(panel).toContain('data-testid="cue-case-picked-serial">{serialText(serial)}');
        expect(panel).toContain("function PickedCelebration(");
        expect(read("client/src/index.css")).toContain(".cc-picked-rays, .cc-confetti, .cc-picked-cue { animation: none; }");
        expect(read("client/src/components/hiq/cueCase/CueCaseEntry.tsx")).toContain('onClick={() => setLocation("/cue-case?invite=1")}');
        const page = read("client/src/pages/hiq/cue-case.tsx");
        expect(page).toContain('<CoachTour id="cue-case-invite"');
        expect(page).toContain('if (!seen) localStorage.setItem("rankue_tour_cue-case-invite", "1");');
    });
});

describe("친구 초대 — 버튼 하나(2026-10-16 오너: '링크까지 같이 · 버튼 하나로')", () => {
    it("파일 없이 링크와 글만 보낸다 — 받는 쪽에 초대 카드 미리보기가 붙는다 · 공유창이 없으면 복사", () => {
        const api = read("client/src/components/hiq/invite/inviteApi.ts");
        expect(api).toContain("await Share.share({ title: o.title, text: o.text, url: o.url, dialogTitle: o.title });");
        expect(api).toContain('return (await copyText(`${o.text}\\n${o.url}`)) ? "copied" : "failed";');
        const panel = read("client/src/components/hiq/invite/InvitePanel.tsx");
        expect(panel).toContain('onClick={() => { void sendLink(); }}');
        expect(panel).toContain('data-testid="cue-case-invite-card"');
    });
});
