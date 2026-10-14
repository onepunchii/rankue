import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALERT_STRIP_REST_DAYS, alertInstallTitle, alertStripPlan } from "./alertReach";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const DAY = 86_400_000, now = Date.parse("2026-10-14T12:00:00Z");

describe("알림이 닿는가 — 웹 회원에게 앱을 권하는 때", () => {
    it("띠: 앱 밖 · 켜 둔 알림이 있고 · 푸시가 닿지 않을 때만. 닫으면 사흘 쉰다", () => {
        const r = { watches: 2, areas: 1, push: false };
        expect(alertStripPlan(r, { native: false, closedAt: null, now })).toEqual({ show: true, count: 3 });
        expect(alertStripPlan(r, { native: true, closedAt: null, now }).show).toBe(false);
        expect(alertStripPlan({ ...r, push: true }, { native: false, closedAt: null, now }).show).toBe(false);
        expect(alertStripPlan({ watches: 0, areas: 0, push: false }, { native: false, closedAt: null, now }).show).toBe(false);
        expect(alertStripPlan(null, { native: false, closedAt: null, now }).show).toBe(false);
        expect(alertStripPlan(r, { native: false, closedAt: now - (ALERT_STRIP_REST_DAYS * DAY - 1000), now }).show).toBe(false);
        expect(alertStripPlan(r, { native: false, closedAt: now - ALERT_STRIP_REST_DAYS * DAY, now }).show).toBe(true);
    });
    it("팝업 제목 — 무엇의 알림인지 넣는다", () => {
        expect(alertInstallTitle("강남300 취소티", "관심 등록했어요")).toBe("강남300 취소티 알림은 앱에서 울려요");
        expect(alertInstallTitle(null, "경기 북부 알림을 켰어요")).toBe("경기 북부 알림을 켰어요 — 알림은 앱에서 울려요");
    });
    it("알림을 켠 순간(브라우저) — 설치 팝업을 '알림' 판으로 띄우고, 단추는 막지 않는다 · 유입 자리를 가른다", () => {
        const reach = read("client/src/golf/components/course/AlertReach.tsx");
        expect(reach).toContain("openInstallForAlert({ title: alertInstallTitle(what, done), source: \"golf_alert\" })");
        const sheet = read("client/src/components/hiq/AppInstallSheet.tsx");
        expect(sheet).toContain("export function openInstallForAlert(");
        expect(sheet).toContain("ALERT_INSTALL_SESSION_KEY");
        // 스토어 링크는 그 자리의 이름으로 — 스토어 콘솔에서 효과를 잰다
        expect(sheet).toContain("iosStoreUrl(reason.source)");
        expect(read("shared/appLinks.ts")).toContain('| "alert_strip"');
        // 띠는 골프 홈과 알림함 위에
        expect(read("client/src/golf/pages/Dashboard.tsx")).toContain("<AlertAppStrip");
        expect(read("client/src/components/hiq/menu/NotificationInbox.tsx")).toContain("<AlertAppStrip");
        // 서버 — 켜 둔 수와 푸시가 닿는지만(토큰 값은 내보내지 않는다)
        const route = read("server/routes/modules/golfCourses.ts");
        expect(route).toContain('router.get("/alerts/reach", requireAuth');
        expect(route).toContain("push_token is not null");
    });
    it("문구는 다섯 언어에 있다(알림함은 모든 종목이 같이 쓰는 화면)", () => {
        for (const l of ["ko", "en", "vi", "tr", "es"]) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of ["alertApp.strip", "alertApp.stripAction", "alertApp.sheetDesc", "alertApp.close"]) expect(f, `${l} ${k}`).toContain(`"${k}":`);
        }
    });
});
