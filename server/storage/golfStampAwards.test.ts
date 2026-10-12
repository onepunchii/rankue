import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 도장첩에서 받은 것의 기록(2026-10-12) — 무엇을 받는지는 shared/golfStampAwards.test.ts 가 본다.
 * 여기는 적는 길과 읽는 길: 골프 기록이 바뀌는 곳마다 적히는가 · 읽기는 읽기만 하는가 · 표의 모양이 생성 SQL 과 같은가.
 * (적기 · 순번 · 표가 없을 때는 메모리형 DB 로 따로 돌려 봤다 — 운영 DB 를 건드리는 시험은 두지 않는다.)
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|--)/.test(l)).join("\n");

describe("적는 길", () => {
    const repo = code(read("server/storage/golf.repo.ts"));

    it("골프 기록이 바뀌는 길이 다 지나는 곳(updateGolfStats)에서 적는다 — 끝내기 · 늦은 현장 인증 · 기록 정리", () => {
        const fn = repo.slice(repo.indexOf("async updateGolfStats(userId: string)"), repo.indexOf("async getGolfPassportStats("));
        // 기록이 하나도 없어 일찍 돌아가기 전에 부른다
        expect(fn.indexOf("await this.syncStampAwards(userId)")).toBeGreaterThan(0);
        expect(fn.indexOf("await this.syncStampAwards(userId)")).toBeLessThan(fn.indexOf("if (history.length === 0) return null;"));
        // 실패해도 평균 · 등급 계산은 막지 않는다
        expect(fn).toContain('await this.syncStampAwards(userId).catch((e) => console.error("[golf] syncStampAwards", e));');
        // 끝내기와 늦은 인증이 그곳을 부른다
        expect(repo).toContain("for (const mid of recorded) {\n            await this.updateGolfStats(mid)");
        expect(repo.match(/await this\.recountGolfStats\(/g)!.length).toBeGreaterThanOrEqual(2);
    });

    it("도장은 여권과 같은 셈이다 — 인증 도장만(미인증 기록은 넘기지 않는다)", () => {
        const fn = repo.slice(repo.indexOf("async syncStampAwards(memberId: string)"), repo.indexOf("async updateGolfStats(userId: string)"));
        expect(fn).toContain("const stats = await this.getGolfPassportStats(memberId);");
        expect(fn).toContain("stats.stamps.map((s) => ({ clubId: s.clubId, name: s.name, firstDate: s.firstDate }))");
        expect(fn).not.toContain("recordStamps");
    });

    it("아직 안 적은 것만 적고, 순번은 '가장 큰 순번 + 1' — 겹치면 다시 센다. 표가 없으면 빈 목록", () => {
        const store = code(read("server/storage/golfStampAwards.ts"));
        expect(store).toContain("if (have.has(stampAwardId(d.kind, d.key))) continue;");
        expect(store).toContain("coalesce(max(serial), 0) + 1");
        expect(store).toContain("on conflict (member_id, kind, key) do nothing");
        expect(store).toContain("if (serialClash(e) && attempt < SERIAL_RETRIES) continue;");
        expect(store.match(/if \(missingTable\(e\)\) return \[\];/g)!.length).toBe(2);
        // 날짜는 ISO 글자로 넘겨 UTC 벽시계로 적는다(JS Date 를 그대로 넘기면 기계의 시간대에 따라 어긋난다)
        expect(store).toContain("const at = new Date(d.earnedAt).toISOString();");
        expect(store).toContain("::timestamptz at time zone 'UTC'");
        // 고치거나 지우는 길이 없다
        expect(store).not.toMatch(/\.update\(|\.delete\(|delete from|update golf_stamp_awards/);
    });
});

describe("업적 핀도 같은 표에", () => {
    it("kind 'pin' 으로, 도장첩의 것과 받은 순서로 섞어 적는다 — 순번 · 한 번만 · 고치지 않음은 같은 길이다", () => {
        const store = code(read("server/storage/golfStampAwards.ts"));
        expect(store).toContain("export async function syncStampAwards(memberId: string, stamps: readonly DatedStamp[], pins: readonly PinDue[] = [], extra: readonly StampAwardDue[] = []): Promise<StampAwardRow[]> {");
        expect(store).toContain('...pins.map((p): StampAwardDue => ({ kind: "pin", key: p.id, earnedAt: p.earnedAt })), ...extra].sort((a, b) => a.earnedAt - b.earnedAt);');
        // 표의 kind 칸은 글자라 표를 고칠 일이 없다
        expect(code(read("migrations/golf_stamp_awards.sql"))).toMatch(/\n\s+kind\s+text not null/);
        expect(read("shared/golfStampAwards.ts")).toContain('export type StampAwardKind = "book" | "all" | "trophy" | "pin" | "black" | "pearl" | "tag" | "special";');
    });
});

describe("읽는 길", () => {
    it("GET /api/hiq/golf/stamp-awards — 본인 것만, 읽기만(적지 않는다)", () => {
        const routes = code(read("server/routes/modules/golf.ts"));
        const at = routes.indexOf('router.get("/stamp-awards", requireAuth,');
        expect(at).toBeGreaterThan(0);
        const fn = routes.slice(at, routes.indexOf("}));", at));
        expect(fn).toContain("listStampAwards(req.userId!)");
        expect(fn).not.toMatch(/syncStampAwards|req\.(query|params|body)/);
    });
});

describe("표", () => {
    it("생성 SQL 과 schema 의 칸 · 제약이 같다. 더하기만 한다", () => {
        const sql = read("migrations/golf_stamp_awards.sql");
        const ddl = code(sql);
        expect(ddl).toContain("create table if not exists golf_stamp_awards (");
        expect(ddl).toContain("create index if not exists golf_stamp_awards_member_idx on golf_stamp_awards (member_id);");
        expect(ddl).not.toMatch(/\bdrop\b|alter table|delete from|\bupdate\b/i);
        const schema = read("shared/schema.ts");
        const table = schema.slice(schema.indexOf('export const golfStampAwards = pgTable("golf_stamp_awards"'), schema.indexOf("export type GolfStampAward ="));
        for (const col of ["id", "member_id", "kind", "key", "serial", "earned_at", "created_at"]) {
            expect(ddl, col).toMatch(new RegExp(`\\n\\s+${col}\\s`));
            expect(table, col).toContain(`("${col}")`);
        }
        for (const name of ["golf_stamp_awards_member_kind_key_unique", "golf_stamp_awards_kind_key_serial_unique", "golf_stamp_awards_member_idx"]) {
            expect(ddl, name).toContain(name);
            expect(table, name).toContain(name);
        }
        // 회원을 지우면 그 사람의 줄도 지워진다
        expect(ddl).toContain("references hiq_members(id) on delete cascade");
        expect(table).toContain('onDelete: "cascade"');
    });
});
