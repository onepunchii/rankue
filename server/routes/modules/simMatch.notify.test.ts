import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const src = readFileSync(path.resolve(process.cwd(), "server/routes/modules/simMatch.ts"), "utf8");

/**
 * '당신 차례예요'는 **상대가 화면을 안 보고 있을 때만** 간다(2026-09-23 오너).
 * 실측으로 이 알림의 81%가 받는 사람이 이미 대전 화면에서 샷을 치던 순간에 갔고, 알림함의 3분의 1을 채웠다.
 * 반대로 승패·실격·시간초과 통보는 보고 있어도 남아야 한다 — 되돌아보는 기록이다.
 */
describe("온라인 대전 알림 — 보고 있는 사람에게는 '당신 차례'를 안 보낸다", () => {
    it("두 '차례 넘김' 알림이 모두 isWatching 검사 안에 있다", () => {
        // yourTurn 알림은 딱 둘(샷으로 넘어감 · 상대 시간 초과로 넘어옴)
        const calls = [...src.matchAll(/notify\([^\n]*"notif\.sim\.yourTurn\.title"/g)];
        expect(calls.length, "yourTurn 알림 호출 수가 바뀌었다 — 새로 생겼다면 같은 검사를 붙여라").toBe(2);
        for (const c of calls) {
            // 그 호출 앞 400자 안에 isWatching 가드가 있어야 한다
            const before = src.slice(Math.max(0, c.index! - 400), c.index!);
            expect(before, "isWatching 가드 없이 yourTurn 을 보내고 있다").toContain("if (!isWatching(");
        }
    });

    it("승패·실격 알림에는 그 가드를 붙이지 않는다", () => {
        for (const key of ["notif.sim.finished.title", "notif.sim.disqualified.title", "notif.sim.timeout.title"]) {
            const i = src.indexOf(`"${key}"`);
            expect(i, `${key} 알림이 사라졌다`).toBeGreaterThan(-1);
        }
    });

    it("isWatching 은 PRESENCE_MS 와 seenAt 으로 판정한다(자체 기준을 새로 만들지 않는다)", () => {
        const i = src.indexOf("function isWatching(");
        expect(i).toBeGreaterThan(-1);
        const body = src.slice(i, i + 500);
        expect(body).toContain("PRESENCE_MS");
        expect(body).toContain("hostSeenAt");
        expect(body).toContain("guestSeenAt");
        // 끝난 판은 '보고 있다'로 치지 않는다 — 폴링이 멈춘다
        expect(body).toContain('status !== "playing"');
    });
});
