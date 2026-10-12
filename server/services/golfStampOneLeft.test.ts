import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 도장첩 '한 곳 남음' 알림(2026-10-12) — 보내는 길. 무엇을 · 언제는 shared/golfStampOneLeft.test.ts 가 본다.
 * (실제로 적히는 것 · 다시 불러도 한 번 · 밤에는 알림함에만은 메모리형 DB 로 따로 돌려 봤다 — 운영 DB 를 건드리는 시험은 두지 않는다.)
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

describe("보내는 길", () => {
    const svc = code(read("server/services/golfStampOneLeft.ts"));

    it("알릴 것이 없으면 아무것도 읽지 않는다 — 흔한 길", () => {
        const early = svc.indexOf("if (fresh.length === 0) return out;");
        expect(early).toBeGreaterThan(0);
        expect(early).toBeLessThan(svc.indexOf("db.execute("));
        expect(svc).toContain("const fresh = oneLeftFresh(stampOneLeft(stamps), nowMs);");
    });

    it("같은 권은 한 번만 — 알림함의 열쇠(reminderKey)로 본다. 그 회원 · 그 type 의 줄만", () => {
        expect(svc).toContain("where member_id::text = ${memberId} and type = ${ONE_LEFT_TYPE} and params->>'reminderKey' = any(");
        expect(svc).toContain("if (seen.has(key)) { out.already++; continue; }");
        expect(svc).toContain("params: { url: t.url, reminderKey: key, book: o.bookId, slot: o.slotKey }");
    });

    it("밤(조용한 시간)에는 기기를 울리지 않고 알림함에만. 낮에는 저장 + 푸시(설정에서 끈 사람은 서비스가 가른다)", () => {
        expect(svc).toContain("const quiet = isGolfQuietHour(nowMs);");
        expect(svc).toContain("if (quiet) { await storage.createNotification({ ...base, isRead: false }); out.inboxOnly++; }");
        expect(svc).toContain("else { await notificationService.sendAndSaveNotification(base); out.pushed++; }");
        expect(svc).toContain('category: "GOLF", type: ONE_LEFT_TYPE');
        // 골프 칸을 직접 고르지 않는다 — type 으로 골프 소식 칸을 탄다
        expect(svc).not.toMatch(/pref:/);
    });

    it("서버가 임포트하는 shared 파일은 './x.js' 로 끝난다(없으면 /api 전체가 죽는다)", () => {
        for (const f of ["server/services/golfStampOneLeft.ts", "shared/golfStampOneLeft.ts"]) {
            const froms = [...read(f).matchAll(/from "(\.[^"]+)"/g)].map((m) => m[1]);
            expect(froms.length).toBeGreaterThan(0);
            for (const x of froms) expect(x, `${f} → ${x}`).toMatch(/\.js$/);
        }
    });
});

describe("부르는 곳", () => {
    const repo = code(read("server/storage/golf.repo.ts"));
    const fn = repo.slice(repo.indexOf("async syncStampAwards(memberId: string)"), repo.indexOf("async updateGolfStats(userId: string)"));

    it("받은 것을 적은 뒤에 같은 도장으로 부른다 — 인증 도장만", () => {
        expect(fn).toContain("const fresh = await syncStampAwards(memberId, stamps, pins);\n        await this.nudgeStampOneLeft(memberId, stamps);\n        return fresh;");
        expect(fn).not.toContain("recordStamps");
    });

    it("한 칸 남은 권이 없으면 알림 서비스를 불러오지도 않는다. 있으면 뚜껑(2.5초)만 기다리고, 실패해도 끝내기를 막지 않는다", () => {
        const gate = fn.indexOf("if (stampOneLeft(stamps).length === 0) return;");
        expect(gate).toBeGreaterThan(0);
        expect(gate).toBeLessThan(fn.indexOf('await import("../services/golfStampOneLeft.js")'));
        expect(fn).toContain("new Promise((r) => setTimeout(r, ONE_LEFT_WAIT_MS))");
        expect(fn).toContain('notifyStampOneLeft(memberId, stamps).catch((e) => console.error("[golf] stampOneLeft", e))');
        expect(repo).toContain("const ONE_LEFT_WAIT_MS = 2500;");
        // 저장소가 알림 서비스를 정적으로 임포트하지 않는다(서로를 문다)
        expect(read("server/storage/golf.repo.ts")).not.toMatch(/^import .*notificationService/m);
        expect(read("server/storage/golf.repo.ts")).not.toMatch(/^import .*services\/golfStampOneLeft/m);
    });
});
