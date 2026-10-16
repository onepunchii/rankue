import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { actionSport, adminActionLabel, parseActionSport, scrubAdminDetail, scrubAdminResults } from "./adminActions";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("관리자 작업 기록(2026-10-16)", () => {
    it("PIN · 전화 · 계좌 · 비밀번호는 남기지 않는다 · 긴 글은 자른다", () => {
        const out = scrubAdminDetail({ body: { pin: "1234", newPin: "9999", phone: "01012345678", accountNumber: "111", password: "x", name: "김랭큐", note: "가".repeat(300), kind: "book", key: "gangwon" } }) as any;
        expect(out.body.pin).toBe("•••");
        expect(out.body.newPin).toBe("•••");
        expect(out.body.phone).toBe("•••");
        expect(out.body.accountNumber).toBe("•••");
        expect(out.body.password).toBe("•••");
        expect(out.body.name).toBe("김랭큐");
        expect(out.body.key).toBe("gangwon"); // 골프 보상의 열쇠(key)는 비밀이 아니다
        expect(String(out.body.note)).toMatch(/…\(300자\)$/);
    });
    it("'바뀐 것'은 셋까지 · 조금 더 깊게 · 비밀 칸은 지운다(골프 ④)", () => {
        const r = scrubAdminResults([{ action: "a", before: [1, 2], members: [{ id: "x", list: [1] }], phone: "010" }, { action: "b" }, { action: "c" }, { action: "d" }]) as any[];
        expect(r).toHaveLength(3);
        expect(r[0]).toEqual({ action: "a", before: [1, 2], members: [{ id: "x", list: [1] }], phone: "•••" });
    });
    it("종목 칩 — 주소 머리로, 굿즈는 보낸 값의 sport 로 · 새 메뉴 이름표", () => {
        expect(actionSport("/api/hiq/admin/golf/rounds/x/onsite")).toBe("golf");
        expect(actionSport("/api/hiq/admin/membership/orders/1/status")).toBe("golf");
        expect(actionSport("/api/hiq/admin/billiards/online/x/void")).toBe("billiards");
        expect(actionSport("/api/hiq/admin/games/x")).toBe("billiards");
        expect(actionSport("/api/hiq/admin/goods/grant", { body: { sport: "hiking" } })).toBe("hiking");
        expect(actionSport("/api/hiq/admin/goods/grant", { body: { sport: "x" } })).toBeNull();
        expect(actionSport("/api/hiq/admin/push")).toBeNull();
        expect(parseActionSport("fishing")).toBe("fishing");
        expect(parseActionSport("tennis")).toBeNull();
        expect(adminActionLabel("POST", "/api/hiq/admin/golf/pars/changes/12/revert")).toBe("카드가 바꾼 파 되돌리기");
        expect(adminActionLabel("POST", "/api/hiq/admin/fishing/decor/x/take-back")).toBe("수족관 장식 거두기");
        expect(adminActionLabel("POST", "/api/hiq/admin/hiking/summits/x/revoke")).toBe("정상 인증 취소");
    });
    it("주소 → 이름표(모르면 null)", () => {
        expect(adminActionLabel("DELETE", "/api/hiq/admin/games/abc")).toBe("실전 경기 지우기");
        expect(adminActionLabel("POST", "/api/hiq/admin/golf/rounds/r1/void")).toBe("라운드 무효");
        expect(adminActionLabel("PATCH", "/api/hiq/admin/golf/courses/sky72")).toBe("골프장 정보 고치기");
        expect(adminActionLabel("POST", "/api/hiq/admin/whatever")).toBeNull();
    });
    it("가드 한 곳에서 — 바꾸는 요청만, 답하기 직전에, 한 요청에 한 줄", () => {
        const g = read("server/middleware/adminAuth.ts");
        expect(g).toContain('if (req.method !== "GET" && req.method !== "HEAD") recordOnReply(req, res, { id: profile.id, name: String(profile.nickname ?? "관리자") });');
        expect(g).toContain("if (req.__adminRecorded) return;");
        expect(g).toContain(".finally(() => send(body));");
        const m = read("migrations/admin_actions.sql").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
        expect(m).toContain("create table if not exists hiq_admin_actions");
        expect(m).not.toMatch(/\b(drop|delete|truncate|update)\b/i);
    });
});

describe("탈퇴 정리 — 낚시 · 등산(2026-10-16 어드민 조사)", () => {
    it("탈퇴하면 조과(좌표) · 사진 · 장비 · 장식, 표시 지점(위경도) · 정상 · 산행 · 목표 · 와펜을 지운다", () => {
        const purge = read("server/storage/withdrawPurge.ts");
        for (const t of ["fishing_catches", "fishing_gear", "fishing_decor_awards", "fishing_tanks", "hiq_invite_codes", "hiking_marks", "hiking_summits", "hiking_awards", "hiking_trips", "hiking_goals"]) {
            expect(purge).toContain(`delete from ${t} where member_id`);
        }
        expect(purge).toContain("returning photo_url, thumb_url");
        expect(read("server/routes/modules/member.ts")).toContain("await deleteBlobs((await purgeFishingHiking(req.userId!)");
    });
});

describe("이름표 버그(2026-10-16)", () => {
    it("낚시 크루가 '당구'로 보이지 않는다 · 종목 칩 넷", () => {
        const v = read("client/src/pages/admin/CrewsView.tsx");
        expect(v).toContain('FISHING: { label: "낚시", tone: "info" },');
        expect(v).toContain('{ id: "FISHING", label: "낚시"');
        expect(v).toContain('{ id: "HIKING", label: "등산"');
    });
    it("등산 회원 공지는 등산 알림함에(category HIKING)", () => {
        const a = read("server/routes/modules/admin.ts");
        expect(a).toContain('const category = golf ? "GOLF" : hiking ? "HIKING" : "admin";');
        expect(read("client/src/pages/admin/PushView.tsx")).toContain('{ id: "hiking", label: "등산 회원" },');
    });
});
