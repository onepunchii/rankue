import { describe, it, expect } from "vitest";
import { chatMaxHeight } from "./chatLayout";
import { computeLayout } from "../render/tableGeometry";
import { TABLES } from "@shared/sim/params";

/** SimulatorPage 의 TABLE_INSETS 와 같다(DOCK_HEIGHT 106 + 8). */
const INSETS = { top: 8, right: 68, bottom: 114, left: 8 };
const base = { table: TABLES.DAEDAE, insets: INSETS, bottomGap: 12, floor: 60 };

describe("chatMaxHeight — 대화창이 당구 천을 덮지 않는 높이", () => {
    it("375×812: 천 아래 144 px 에서 바닥 여백을 뺀 132", () => {
        expect(chatMaxHeight({ ...base, width: 375, height: 690 })).toBe(132);
    });

    it("그 높이로 그리면 대화창 윗변이 천 아래끝보다 아래다 — 공을 가릴 수 없다", () => {
        for (const [w, h] of [[375, 690], [375, 603], [430, 795], [390, 720]] as const) {
            const maxH = chatMaxHeight({ ...base, width: w, height: h });
            const L = computeLayout({ width: w, height: h }, TABLES.DAEDAE, INSETS);
            const clothBottom = L.play.y + L.play.h;
            const chatTop = h - base.bottomGap - maxH;
            expect(chatTop).toBeGreaterThanOrEqual(clothBottom);
        }
    });

    it("SE 처럼 짧아도 계산은 같다 — 기종마다 따로 어림하지 않는다", () => {
        const se = chatMaxHeight({ ...base, width: 375, height: 603 });
        expect(se).toBeLessThan(chatMaxHeight({ ...base, width: 375, height: 690 }));
        expect(se).toBeGreaterThan(100);
    });

    it("크기를 아직 모르면(0) 바닥값 — 입력줄은 늘 들어가야 한다", () => {
        expect(chatMaxHeight({ ...base, width: 0, height: 0 })).toBe(60);
    });
});
