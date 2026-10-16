import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("어드민 › 등산 › 산행 사진 — 골프 라운드 사진과 같은 화면 · 같은 처리", () => {
    it("쓰기는 신고 큐와 같은 실행기로(targetType 'hiking_photo', 신고가 없어도)", () => {
        const r = read("server/routes/modules/adminHiking.ts");
        expect(r).toMatch(/applyModerationAction\(\{ targetType: "hiking_photo", targetId: id, action, adminProfileId: [^}]*allowUnreported: true/);
        for (const p of ['router.post("/photos/:id/hide"', 'router.post("/photos/:id/appeal"', 'router.delete("/photos/:id"']) expect(r).toContain(p);
    });
    it("목록은 골프와 같은 모양 — 골프장 자리에 산, 라운드는 없다", () => {
        const s = read("server/storage/adminHikingPhotos.ts");
        expect(s).toMatch(/course: \{ slug: r\.mountain_slug \?\? null, name: r\.mountain_name \?\? null, path: r\.mountain_slug \? hikingMountainPath\(r\.mountain_slug\) : null \}/);
        expect(s).toMatch(/round: null,/);
        expect(s).toMatch(/availableActions\(\{ targetType: "hiking_photo"/);
    });
    it("화면은 하나(GolfPhotosView kind=\"hiking\") — 라운드 줄은 라운드가 있을 때만", () => {
        expect(read("client/src/pages/admin/dashboard.tsx")).toContain('<GolfPhotosView kind="hiking" onOpenMember={setOpenMemberId} />');
        const v = read("client/src/pages/admin/golf/GolfPhotosView.tsx");
        expect(v).toContain('hiking: { key: HIKING_PHOTOS_KEY, place: "산", page: "산 페이지", photo: "산행 사진"');
        expect(v).toMatch(/\{p\.round && \(\s*<Row label="라운드">/);
    });
});
