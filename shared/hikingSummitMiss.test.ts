import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accuracyBand, fixErrorReason, isSummitClient, isSummitMissReason, maybeOnTop, SUMMIT_MISS_LABEL, SUMMIT_MISS_REASONS } from "./hikingSummitMiss";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("정상 인증 실패의 까닭 — 좌표 없이(2026-10-24)", () => {
    it("정확도는 값 대신 구간", () => {
        expect(accuracyBand(5)).toBe("<20m");
        expect(accuracyBand(20)).toBe("20-50m");
        expect(accuracyBand(50)).toBe("20-50m");
        expect(accuracyBand(120)).toBe("50-200m");
        expect(accuracyBand(201)).toBe(">200m");
        expect(accuracyBand(null)).toBeNull();
        expect(accuracyBand(undefined)).toBeNull();
        expect(accuracyBand("x")).toBeNull();
        expect(accuracyBand(-1)).toBeNull();
    });
    it("화면이 알린 위치 실패 — 거부 · 묻지 못함은 거부, 못 씀은 못 씀, 그 밖은 없음", () => {
        expect(fixErrorReason("denied")).toBe("denied");
        expect(fixErrorReason("prompt")).toBe("denied");
        expect(fixErrorReason("unavailable")).toBe("unavailable");
        expect(fixErrorReason("granted")).toBeNull();
        expect(fixErrorReason(undefined)).toBeNull();
    });
    it("까닭 · 기기 종류는 정해진 값만, 까닭마다 관리자 이름이 있다", () => {
        for (const r of SUMMIT_MISS_REASONS) { expect(isSummitMissReason(r)).toBe(true); expect(SUMMIT_MISS_LABEL[r]).toBeTruthy(); }
        expect(isSummitMissReason("ok")).toBe(false);
        expect(isSummitClient("app")).toBe(true);
        expect(isSummitClient("ios")).toBe(false);
    });
    it("'정상 근처' — 150–500m · 위치 흐림 · 못 잡음 · 못 씀. 멀리서 눌러 본 것 · 거부는 아니다", () => {
        expect(maybeOnTop({ reason: "far", bucket: "150-500m" })).toBe(true);
        expect(maybeOnTop({ reason: "coarse", bucket: "coarse" })).toBe(true);
        expect(maybeOnTop({ reason: "no-fix", bucket: "no-fix" })).toBe(true);
        expect(maybeOnTop({ reason: "unavailable", bucket: null })).toBe(true);
        expect(maybeOnTop({ reason: "far", bucket: ">2km" })).toBe(false);
        expect(maybeOnTop({ reason: "far", bucket: "500m-2km" })).toBe(false);
        expect(maybeOnTop({ reason: "denied", bucket: null })).toBe(false);
    });
});

describe("연결", () => {
    const route = read("server/routes/modules/hiking.ts");
    const post = route.slice(route.indexOf('router.post("/summits",'), route.indexOf('router.post("/summits/record"'));
    it("서버 — 인증이 안 되면 까닭을 남기고(기다린다), 좌표는 넘기지 않는다", () => {
        expect(post).toContain("await addSummitMiss(req.userId!, m.id, { reason: judged.reason, bucket: judged.bucket, accuracy: accuracyBand(acc), client });");
        expect(post).toContain("const fixError = fixErrorReason(req.body?.fixError);");
        expect(post).toContain("await addSummitMiss(req.userId!, m.id, { reason: fixError, bucket: null, accuracy: null, client });");
        expect(post).not.toMatch(/addSummitMiss\([^)]*\blat\b/);
        const store = read("server/storage/hikingStamps.ts");
        expect(store).toContain("insert into hiking_summit_misses (member_id, mountain_id, reason, bucket, accuracy, client)");
        expect(store).not.toMatch(/hiking_summit_misses[^`]*\blat\b/);
        const sql = read("migrations/hiking_summit_misses.sql");
        expect(sql).toContain("create table if not exists hiking_summit_misses (");
        expect(sql).not.toMatch(/\blat\b|\blng\b/);
    });
    it("화면 — 위치를 못 받아도 까닭만 알리고, 기기 종류를 같이 보낸다 · 거부와 못 잡음은 안내가 다르다", () => {
        const c = read("client/src/hiking/stamps/SummitCheckin.tsx");
        expect(c).toContain('body: JSON.stringify({ mountainId, fixError: pos.status, client })');
        expect(c).toContain("accuracy: pos.fix.accuracy, client })");
        expect(c).toContain('r.denied === "unavailable" ? "위치를 잡지 못했어요.');
    });
    it("관리자 — 실패한 시도 목록(그 뒤의 결과까지) · 정리(180일 · 탈퇴)", () => {
        const admin = read("server/routes/modules/adminHiking.ts");
        expect(admin).toContain('router.get("/summit-misses",');
        expect(admin).toContain("then 'verified' when count(*) > 0 then 'recorded' else 'none' end");
        const view = read("client/src/pages/admin/HikingSummitsView.tsx");
        expect(view).toContain('<KpiTile label="실패한 시도"');
        expect(view).toContain("<SummitMisses rows={misses} near={nearOnly} onOpenMember={onOpenMember} />");
        expect(read("server/storage/withdrawPurge.ts")).toContain('await run("hiking_summit_misses", sql`delete from hiking_summit_misses where member_id = ${memberId}::uuid returning id`);');
        expect(read("server/routes/modules/cron.ts")).toContain("delete from hiking_summit_misses where created_at < now() - interval '180 days'");
    });
});
