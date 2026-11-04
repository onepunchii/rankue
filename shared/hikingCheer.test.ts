/**
 * 산행 사진 응원(2026-11-04 오너: "사진 응원 기능만 먼저 시행하자"). DB 없이 본다 — 순수 함수는 그대로, 질의 · 라우트 · 화면은 소스의 모양을 고정한다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HIKING_CHEER_LABEL, HIKING_CHEER_PUSH_GAP_MIN, hikingCheerKey, hikingCheerNotice } from "./hikingPhotos";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("글", () => {
    it("알림 — 보낸 사람 · 그 산 · 둘 이상이면 수", () => {
        expect(hikingCheerNotice("초록발", "계룡산", 1)).toEqual({ title: "👏 초록발님이 내 산행 사진을 응원했어요", body: "계룡산 사진" });
        expect(hikingCheerNotice("초록발", "계룡산", 3).body).toBe("계룡산 사진 · 응원 3개");
        expect(hikingCheerNotice("", null, 1)).toEqual({ title: "👏 랭큐 회원님이 내 산행 사진을 응원했어요", body: "산행 사진" });
        expect(hikingCheerKey("p1", "m1")).toBe("hk-cheer:p1:m1");
        expect(HIKING_CHEER_PUSH_GAP_MIN).toBe(30);
    });
    it("내 사진의 한 줄 · 재촉하는 말이 없다", () => {
        expect(HIKING_CHEER_LABEL.own(0)).toBe("아직 받은 응원이 없어요");
        expect(HIKING_CHEER_LABEL.own(4)).toBe("응원 4개를 받았어요");
        const all = Object.values(HIKING_CHEER_LABEL).filter((v) => typeof v === "string").join(" ");
        expect(all).not.toMatch(/빨리|서두|지금 바로|놓치|매칭|만나/);
    });
});

describe("고정: 표 · 저장", () => {
    it("표는 더하기만 — 사진 하나에 한 사람 한 번, 사진 · 회원이 지워지면 같이", () => {
        const sql = code(read("migrations/hiking_photo_cheers.sql").replace(/^--.*$/gm, ""));
        expect(sql).toContain("create table if not exists hiking_photo_cheers");
        expect(sql).toContain("photo_id   uuid not null references hiking_photos(id) on delete cascade");
        expect(sql).toContain("primary key (photo_id, member_id)");
        expect(sql).not.toMatch(/drop |alter table .* drop/i);
    });
    it("보내기: 공개 · 안 가려진 사진만, 서로 차단한 사이는 없는 사진처럼, 내 사진은 안 됨, 두 번 눌러도 하나", () => {
        const s = code(read("server/storage/hikingPhotos.ts"));
        const f = s.slice(s.indexOf("export async function cheerPhoto("), s.indexOf("export async function uncheerPhoto("));
        expect(f).toContain("where p.id = ${photoId}::uuid and p.is_public and p.hidden_at is null");
        expect(f).toContain("(b.blocker_id = p.member_id and b.blocked_id = ${memberId}::uuid) or (b.blocker_id = ${memberId}::uuid and b.blocked_id = p.member_id)");
        expect(f).toContain('if (p.owner_id === memberId) return { ok: false, reason: "own" };');
        expect(f).toContain("on conflict do nothing returning photo_id");
        // 거두기는 내 것만
        expect(s).toContain("delete from hiking_photo_cheers where photo_id = ${photoId}::uuid and member_id = ${memberId}::uuid");
    });
    it("목록 셋(이 산의 사진 · 요즘 사진 · 내 사진)에 받은 수, 보는 사람의 것 — 표가 없으면 응원 없이 다시 읽는다", () => {
        const s = code(read("server/storage/hikingPhotos.ts"));
        expect(s.match(/await withCheers\(/g)).toHaveLength(2);
        expect(s).toContain("if (missingCheers(e)) return (await run(MINE_NO_CHEERS)).map(out);");
        expect(s).toContain("exists (select 1 from hiking_photo_cheers c where c.photo_id = p.id and c.member_id = ${viewerId}::uuid)");
    });
    it("탈퇴하면 보낸 응원을 지운다", () => {
        const w = read("server/storage/withdrawPurge.ts");
        expect(w).toContain('"hiking_photo_cheers",');
        expect(w).toContain('await run("hiking_photo_cheers", sql`delete from hiking_photo_cheers where member_id = ${memberId}::uuid returning photo_id`);');
    });
});

describe("고정: 문 · 알림", () => {
    it("보내기 · 거두기 모두 등산을 쓰는 회원만, 남의 회원 id 를 요청에서 받지 않는다", () => {
        const r = code(read("server/routes/modules/hiking.ts"));
        expect(r).toContain('router.put("/photos/:id/cheer", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {');
        expect(r).toContain('router.delete("/photos/:id/cheer", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {');
        expect(r).toContain("const r = await cheerPhoto(id, req.userId!);");
        expect(r).toContain("if (r.added) {");
    });
    it("같은 사람 · 같은 사진은 한 번만 알리고, 푸시는 30분에 한 번 — 그 사이는 알림함에만, 등산 알림함으로", () => {
        const n = code(read("server/services/hikingCheer.ts"));
        expect(n).toContain("params->>'reminderKey' = ${key} limit 1");
        expect(n).toContain("created_at > now() - make_interval(mins => ${HIKING_CHEER_PUSH_GAP_MIN})");
        expect(n).toContain('category: "HIKING", type: "COMMUNITY"');
        expect(n).toContain("await storage.createNotification({ ...base, isRead: false });");
    });
    it("화면: 남의 사진에만 단추, 방문자는 사진 화면을 닫고 가입 팝업, 썸네일 · 내 사진 · 사진 줄에 받은 수", () => {
        const g = read("client/src/hiking/photos/MountainPhotos.tsx");
        expect(g).toContain("<CheerButton key={`cheer:${open.id}`} photo={open}");
        expect(g).toContain("onGuest={() => { close(); askHikingLogin(setLocation, { title: HIKING_CHEER_LABEL.loginTitle, desc: HIKING_CHEER_LABEL.loginDesc }); }} />");
        expect(g).toContain("<CheerCount n={p.cheers} overlay className=\"absolute bottom-1 left-1\" />");
        expect(read("client/src/hiking/photos/MyPhotos.tsx")).toContain("<CheerCount n={p.cheers} overlay className=\"absolute bottom-1 left-1\" />");
        expect(read("client/src/hiking/components/FeaturedPhotos.tsx")).toContain("<CheerCount n={p.cheers} />");
        const b = read("client/src/hiking/photos/CheerParts.tsx");
        expect(b).toContain('data-track-as="hiking-photo-cheer"');
        expect(b).toContain("onClick={() => { if (!member) { onGuest(); return; } m.mutate(!state.on); }}");
    });
});
