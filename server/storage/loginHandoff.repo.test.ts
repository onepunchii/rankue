import { beforeEach, describe, expect, it, vi } from "vitest";
import { insertLoginHandoff, recentLoginHandoffs, redeemLoginHandoff, sweepLoginHandoffs } from "./loginHandoff.repo.js";

/**
 * '앱에서 열기' 저장소(2026-10-06)가 **어떤 SQL 을 만드는지** 본다. DB 에는 붙지 않는다(.env 는 운영 DB 다) —
 * db 를 drizzle 의 프록시 드라이버로 바꿔, 진짜 저장소 코드가 만든 문장과 값을 받아 적기만 한다.
 * 라우트 시험(routes/modules/handoff.test.ts)의 가짜 저장소는 "한 번만 쓰인다"를 흉내 낼 뿐이라, 그 약속이 진짜 문장에 있는지는 여기서 지킨다.
 * 아래 해시·id 는 시험용으로 지어낸 글자다.
 */
const cap = vi.hoisted(() => ({
    calls: [] as { sql: string; params: unknown[]; method: string }[],
    /** 다음 질의에 돌려줄 행(프록시 드라이버는 값 배열로 받는다) */
    rows: [] as unknown[][],
}));
vi.mock("../db.js", async () => {
    const { drizzle } = await import("drizzle-orm/pg-proxy");
    const db = drizzle(async (sql: string, params: unknown[], method: string) => {
        cap.calls.push({ sql, params, method });
        return { rows: cap.rows };
    });
    return { db, pool: {} };
});

const HASH = "a".repeat(64);
const MEMBER = "0b0e6f0e-8a31-4c55-9d2e-1f7c3b6a9e10";
/** 여러 줄·겹친 공백을 한 칸으로 */
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

beforeEach(() => {
    cap.calls = [];
    cap.rows = [];
});

describe("redeemLoginHandoff — 한 번만 쓰이게", () => {
    it("찾기와 '썼음' 표시가 한 문장이다: 안 썼고 만료 전인 행만 바꾸고 회원 id 를 돌려받는다", async () => {
        cap.rows = [[MEMBER]];
        const out = await redeemLoginHandoff(HASH);
        expect(out).toBe(MEMBER);
        // DB 를 한 번만 부른다 — 먼저 읽고 나중에 쓰면 그 사이에 두 요청이 같은 행을 읽는다
        expect(cap.calls).toHaveLength(1);
        const q = flat(cap.calls[0].sql);
        expect(q).toBe(
            'update "hiq_login_handoffs" set "used_at" = now() '
            + 'where ("hiq_login_handoffs"."token_hash" = $1 and "hiq_login_handoffs"."used_at" is null and "hiq_login_handoffs"."expires_at" > now()) '
            + 'returning "member_id"',
        );
        expect(cap.calls[0].params).toEqual([HASH]);
    });

    it("바뀐 행이 없으면 null — 없는 토큰·만료·이미 쓴 토큰을 구분하지 않는다", async () => {
        cap.rows = [];
        expect(await redeemLoginHandoff(HASH)).toBeNull();
        expect(cap.calls).toHaveLength(1);
        expect(cap.calls[0].sql).not.toMatch(/\bselect\b/i);
    });
});

describe("insertLoginHandoff — 해시만 적는다", () => {
    it("만료는 DB 시계로 지금 + ttl 초다. id·만든 때는 DB 기본값, used_at 은 비운다", async () => {
        await insertLoginHandoff(MEMBER, HASH, 120);
        expect(cap.calls).toHaveLength(1);
        const q = flat(cap.calls[0].sql);
        expect(q).toBe(
            'insert into "hiq_login_handoffs" ("id", "token_hash", "member_id", "created_at", "expires_at", "used_at") '
            + "values (default, $1, $2, default, now() + make_interval(secs => $3), default)",
        );
        expect(cap.calls[0].params).toEqual([HASH, MEMBER, 120]);
    });
});

describe("recentLoginHandoffs — 회원당 10분에 5번을 세는 질의", () => {
    it("그 회원의 창 안 행만 센다. 드라이버가 글자로 준 수도 숫자로 바꾼다", async () => {
        cap.rows = [["5", "50"]];
        expect(await recentLoginHandoffs(MEMBER, 600)).toEqual({ count: 5, oldestAgeSec: 50 });
        const q = flat(cap.calls[0].sql);
        expect(q).toContain("count(*)::int");
        expect(q).toContain('from "hiq_login_handoffs"');
        expect(q).toContain('"hiq_login_handoffs"."member_id" = $1');
        expect(q).toContain('"hiq_login_handoffs"."created_at" > now() - make_interval(secs => $2)');
        expect(cap.calls[0].params).toEqual([MEMBER, 600]);
    });

    it("행이 없으면 0", async () => {
        cap.rows = [[0, 0]];
        expect(await recentLoginHandoffs(MEMBER, 600)).toEqual({ count: 0, oldestAgeSec: 0 });
        cap.rows = [];
        expect(await recentLoginHandoffs(MEMBER, 600)).toEqual({ count: 0, oldestAgeSec: 0 });
    });
});

describe("sweepLoginHandoffs — 쌓이지 않게", () => {
    it("그 회원의 창 밖 행과, 누구 것이든 만료된 지 하루 넘은 행을 지운다", async () => {
        await sweepLoginHandoffs(MEMBER, 600);
        expect(cap.calls).toHaveLength(1);
        const q = flat(cap.calls[0].sql);
        expect(q).toBe(
            'delete from "hiq_login_handoffs" where (("hiq_login_handoffs"."member_id" = $1 and "hiq_login_handoffs"."created_at" < now() - make_interval(secs => $2)) '
            + 'or "hiq_login_handoffs"."expires_at" < now() - make_interval(secs => $3))',
        );
        expect(cap.calls[0].params).toEqual([MEMBER, 600, 24 * 60 * 60]);
    });
});

describe("시각은 전부 DB 의 now() 로 비교한다", () => {
    // raw sql 에 JS Date 를 넣으면 KST 기기에서 9시간 어긋난다(메모: chat-golf-review-backlog) — 값으로 날짜를 넘기지 않는다
    it("어느 질의에도 날짜 값이 넘어가지 않는다", async () => {
        cap.rows = [[MEMBER]];
        await redeemLoginHandoff(HASH);
        await insertLoginHandoff(MEMBER, HASH, 120);
        await sweepLoginHandoffs(MEMBER, 600);
        cap.rows = [[1, 1]];
        await recentLoginHandoffs(MEMBER, 600);
        expect(cap.calls).toHaveLength(4);
        for (const c of cap.calls) {
            for (const p of c.params) {
                expect(p instanceof Date, c.sql).toBe(false);
                expect(typeof p === "string" && /^\d{4}-\d{2}-\d{2}/.test(p), c.sql).toBe(false);
            }
            expect(c.sql, c.sql).toContain("now()");
        }
    });

    it("표 정의: 세 시각 열이 시간대가 있는 열이고, 토큰 해시는 유니크, 회원이 지워지면 같이 지워진다", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const sql = readFileSync(resolve(__dirname, "../../migrations/login_handoffs.sql"), "utf8");
        const ddl = flat(sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"));
        expect(ddl).toContain("CREATE TABLE IF NOT EXISTS hiq_login_handoffs (");
        expect(ddl).toContain("id uuid PRIMARY KEY DEFAULT gen_random_uuid()");
        expect(ddl).toContain("token_hash text NOT NULL");
        expect(ddl).toContain("member_id uuid NOT NULL,");
        expect(ddl).toContain("CONSTRAINT hiq_login_handoffs_member_id_hiq_members_id_fk FOREIGN KEY (member_id) REFERENCES hiq_members(id) ON DELETE CASCADE");
        expect(ddl).toContain("created_at timestamptz NOT NULL DEFAULT now()");
        expect(ddl).toContain("expires_at timestamptz NOT NULL");
        expect(ddl).toContain("used_at timestamptz,");
        expect(ddl).toContain("CONSTRAINT hiq_login_handoffs_token_hash_unique UNIQUE (token_hash)");
        expect(ddl).toContain("CREATE INDEX IF NOT EXISTS hiq_login_handoffs_member_idx ON hiq_login_handoffs (member_id, created_at);");
        expect(ddl).toContain("CREATE INDEX IF NOT EXISTS hiq_login_handoffs_expires_idx ON hiq_login_handoffs (expires_at);");
        // 덧붙이기만 한다 — 지우거나 바꾸는 문장이 없다('ON DELETE CASCADE' 의 DELETE 는 문장이 아니다)
        expect(ddl).not.toMatch(/\b(DROP|ALTER|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s/i);
        expect(ddl.match(/;/g)).toHaveLength(3);
        // 토큰 원문을 담을 열이 없다(token_hash 뿐)
        expect(ddl).not.toMatch(/\btoken\b/i);

        // 스키마(drizzle)와 같은 이름·같은 꼴
        const schema = readFileSync(resolve(__dirname, "../../shared/schema.ts"), "utf8");
        const table = schema.slice(schema.indexOf('export const hiqLoginHandoffs = pgTable("hiq_login_handoffs"'), schema.indexOf("export const hiqPlayerFollows"));
        expect(table).toContain('tokenHash: text("token_hash").notNull().unique(),');
        expect(table).toContain('memberId: uuid("member_id").references(() => hiqMembers.id, { onDelete: "cascade" }).notNull(),');
        expect(table.match(/withTimezone: true/g)).toHaveLength(3);
        expect(table).toContain('index("hiq_login_handoffs_member_idx").on(t.memberId, t.createdAt)');
        expect(table).toContain('index("hiq_login_handoffs_expires_idx").on(t.expiresAt)');
    });
});
