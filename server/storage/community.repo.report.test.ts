/**
 * 2026-10-06 — 회원 재신고 유실. 같은 사람이 같은 회원을 **다른 일로** 다시 신고하면 화면은 "접수됐어요"인데
 * 큐에는 아무것도 안 들어갔다(닫힌 옛 행이 그대로 — onConflictDoNothing). 조인/부킹·1:1 채팅의 메시지 신고가
 * 모두 회원 신고(member)로 들어오면서 이 구멍에 닿는 길이 넓어졌다.
 *
 * DB 없이 확인한다: 가짜 db 가 report() 가 만든 insert 를 적어 두고, 그 설정을 연결 없는 drizzle(pg-proxy)로
 * **실제 SQL 문장으로** 풀어 본다. 운영 DB 로는 실행하지 않았다(쓰기 금지) — 문장 모양까지가 이 시험의 범위다.
 *
 *  (가) member 신고: 충돌하면 닫힌 행만 다시 연다(pending 은 그대로 — 24시간 기한 시계를 밀지 않는다).
 *  (가-2) 검토 중(pending)인 행에 **다른 사유**로 다시 들어오면 그 행의 상세에만 한 줄 덧붙인다(2차 검토) —
 *         예전엔 두 번째 사유가 통째로 버려지고 화면만 "접수됐어요"였다. 상태·사유·시각은 그대로다.
 *  (나) 다른 대상: 예전 문장 그대로(on conflict do nothing).
 *  (다) 자동 블라인드·운영자 알림·큐가 재접수에서 어떻게 되는지 — 손대지 않은 쪽의 식을 소스로 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pg-proxy";

const calls = vi.hoisted(() => ({
    inserts: [] as { table: unknown; values: any; conflict: "nothing" | "update"; config?: any }[],
    updates: [] as { table: unknown; set?: any; where?: any }[],
    reporters: 1,
    /** 회원 신고의 upsert 가 돌려주는 줄 수 — 1: 새로 쓴 줄·다시 연 줄, 0: 있는 줄이 pending 이라 아무것도 안 바뀜 */
    written: 1,
}));
const fakeDb = vi.hoisted(() => ({
    insert: (table: unknown) => ({
        values: (values: any) => ({
            onConflictDoNothing: async (config?: unknown) => { calls.inserts.push({ table, values, conflict: "nothing", config }); },
            onConflictDoUpdate: (config: unknown) => {
                calls.inserts.push({ table, values, conflict: "update", config });
                return { returning: async () => Array.from({ length: calls.written }, () => ({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })) };
            },
        }),
    }),
    // 서로 다른 신고자 수(count DISTINCT reporter_id)
    select: () => ({ from: () => ({ where: async () => [{ count: calls.reporters }] }) }),
    // set → where 를 적어 둔다. where 까지만 기다려도(상세 덧붙임), returning 까지 불러도(자동 가림) 된다
    update: (table: unknown) => {
        const u: { table: unknown; set?: any; where?: any } = { table };
        calls.updates.push(u);
        return { set: (set: any) => { u.set = set; return { where: (where: any) => { u.where = where; return { returning: async () => [] }; } }; } };
    },
}));
vi.mock("../db.js", () => ({ db: fakeDb }));

import { CommunityRepository } from "./community.repo.js";
import { hiqReports } from "../../shared/schema.js";

const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORTER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** 연결 없는 drizzle — 문장만 만든다(질의가 나가면 시험이 실패한다) */
const render = drizzle(async () => { throw new Error("질의가 나가면 안 된다"); });
const repo = new CommunityRepository();
const report = (targetType: string, over: Record<string, unknown> = {}) =>
    repo.report({ targetType, targetId: TARGET, reporterId: REPORTER, reason: "abuse", ...over } as any);

beforeEach(() => { calls.inserts.length = 0; calls.updates.length = 0; calls.reporters = 1; calls.written = 1; });

describe("(가) 회원 신고(member) — 닫힌 신고를 다시 연다", () => {
    it("충돌 대상은 유일 제약 세 칸이고, 바꾸는 것은 상태·사유·상세·시각뿐이다", async () => {
        await report("member", { reason: "spam", detail: "1:1 방에서 광고" });
        expect(calls.inserts).toHaveLength(1);
        const [ins] = calls.inserts;
        expect(ins.table).toBe(hiqReports);
        expect(ins.conflict).toBe("update");
        expect(ins.config.target).toEqual([hiqReports.targetType, hiqReports.targetId, hiqReports.reporterId]);
        expect(Object.keys(ins.config.set).sort()).toEqual(["createdAt", "detail", "reason", "status"]);
        expect(ins.config.set.status).toBe("pending");
        expect(ins.config.set.reason).toBe("spam");
        expect(ins.config.set.detail).toBe("1:1 방에서 광고");
        // 시각은 DB 의 now() — Date 를 넘기지 않는다(큐·알림이 DB 시계로 견준다)
        expect(ins.config.set.createdAt).toBeInstanceOf(SQL);
        expect(ins.config.set.createdAt).not.toBeInstanceOf(Date);
        // 조건은 '바꿀 때'에만 건다(충돌 대상에 걸면 유일 제약과 안 맞는다)
        expect(ins.config.setWhere).toBeInstanceOf(SQL);
        expect(ins.config.where).toBeUndefined();
        expect(ins.config.targetWhere).toBeUndefined();
        // 스키마의 유일 제약과 같은 세 칸이다
        expect(readFileSync(resolve(__dirname, "../../shared/schema.ts"), "utf8"))
            .toContain("unique().on(table.targetType, table.targetId, table.reporterId), // 동일인 중복 신고 방지");
    });

    it("실제 문장: 닫힌 행(pending 이 아닌 행)만 다시 연다 — pending 은 건드리지 않는다", async () => {
        await report("member", { reason: "spam", detail: "다른 일" });
        const [ins] = calls.inserts;
        const q = render.insert(hiqReports).values(ins.values).onConflictDoUpdate(ins.config).toSQL();
        const text = q.sql.replace(/\s+/g, " ");
        expect(text).toMatch(/^insert into "hiq_reports" \(/);
        expect(text).toContain('on conflict ("target_type","target_id","reporter_id") do update set ');
        const set = text.slice(text.indexOf(" do update set ") + " do update set ".length, text.lastIndexOf(" where "));
        expect(set.split(", ").map((s) => s.split(" = ")[0]).sort()).toEqual(['"created_at"', '"detail"', '"reason"', '"status"']);
        expect(set).toContain('"created_at" = now()');
        // 다시 여는 조건 — 있는 행의 상태가 pending 이 아닐 때만. pending 이면 아무것도 바뀌지 않는다(시각도 그대로).
        expect(text.endsWith(` where "hiq_reports"."status" <> 'pending'`)).toBe(true);
        // 닫힌 상태는 actioned·dismissed 둘뿐이다
        expect(hiqReports.status.enumValues).toEqual(["pending", "actioned", "dismissed"]);
        // 넘어가는 값: 새 행의 칸 + 다시 열 때의 상태·사유·상세. Date 는 없다.
        expect(q.params).toContain("pending");
        expect(q.params.filter((p) => p === "spam")).toHaveLength(2);
        expect(q.params.filter((p) => p === "다른 일")).toHaveLength(2);
        expect(q.params.some((p) => p instanceof Date)).toBe(false);
    });

    it("상세 없이 다시 신고하면 옛 상세를 비운다(새 값으로 바꾼다)", async () => {
        await report("member");
        expect(calls.inserts[0].config.set.detail).toBeNull();
        expect(calls.inserts[0].config.set.reason).toBe("abuse");
    });

    it("있는 칸만 쓴다 — 처리자·처리 시각 칸은 이 표에 없다(판단 기록은 hiq_moderation_actions)", () => {
        // 칸이 늘면(예: 처리 시각) 다시 열 때 비워야 하는지 여기서 다시 본다
        expect(Object.keys(getTableColumns(hiqReports))).toEqual(["id", "targetType", "targetId", "reporterId", "reason", "detail", "status", "createdAt"]);
    });

    it("회원 신고는 몇 명이 신고해도 자동으로 가리지 않는다 — 다시 열어도 같다", async () => {
        calls.reporters = 5;
        const r = await report("member");
        expect(r).toEqual({ reportCount: 5, autoBlinded: false, authorId: null });
        // 새로 쓴 줄·다시 연 줄이면 다른 표는 물론 신고 표도 더 건드리지 않는다
        expect(calls.updates).toEqual([]);
    });

    it("새 줄·다시 연 줄은 upsert 한 번으로 끝난다 — 상세 덧붙임 문장은 나가지 않는다", async () => {
        calls.written = 1;
        await report("member", { reason: "abuse", detail: "다른 일" });
        expect(calls.inserts).toHaveLength(1);
        expect(calls.updates).toEqual([]);
    });
});

describe("(가-2) 검토 중인 회원 신고에 다른 사유로 다시 신고 — 그 줄의 상세에만 덧붙인다", () => {
    /** upsert 가 0줄(있는 줄이 pending)일 때 나가는 덧붙임 문장 */
    const appended = async (over: Record<string, unknown> = {}) => {
        calls.written = 0;
        const r = await report("member", over);
        expect(calls.inserts).toHaveLength(1);
        expect(calls.updates).toHaveLength(1);
        const [u] = calls.updates;
        const q = render.update(hiqReports).set(u.set).where(u.where).toSQL();
        return { r, u, text: q.sql.replace(/\s+/g, " "), params: q.params };
    };

    it("upsert 는 쓴 줄의 id 를 돌려받는다 — 다시 여는 조건이 거짓(pending)이면 Postgres 는 0줄을 돌려준다", async () => {
        await report("member", { reason: "spam" });
        const [ins] = calls.inserts;
        const text = render.insert(hiqReports).values(ins.values).onConflictDoUpdate(ins.config).returning({ id: hiqReports.id })
            .toSQL().sql.replace(/\s+/g, " ");
        expect(text.endsWith(` where "hiq_reports"."status" <> 'pending' returning "id"`)).toBe(true);
    });

    it("신고 표 한 줄의 상세만 바꾼다 — 상태·사유·시각은 그대로(24시간 기한 시계를 밀지 않는다)", async () => {
        const { u, text } = await appended({ reason: "abuse" });
        expect(u.table).toBe(hiqReports);
        expect(Object.keys(u.set)).toEqual(["detail"]);
        expect(u.set.detail).toBeInstanceOf(SQL);
        const set = text.slice(text.indexOf(" set ") + " set ".length, text.indexOf(" where "));
        // 있는 상세 뒤에 줄을 바꿔 붙이고(상세가 비어 있으면 덧붙인 줄만), 길이는 묶는다
        expect(set).toBe('"detail" = left(concat_ws(chr(10), "hiq_reports"."detail", $1::text), 1000)');
        expect(set).not.toMatch(/created_at|status|"reason"/);
    });

    it("실제 문장: 그 신고자의 그 회원 신고 가운데 pending 이고, 사유가 다르고, 아직 안 덧붙인 줄만", async () => {
        const { text, params } = await appended({ reason: "abuse" });
        expect(text).toBe(
            'update "hiq_reports" set "detail" = left(concat_ws(chr(10), "hiq_reports"."detail", $1::text), 1000)'
            + ' where ("hiq_reports"."target_type" = $2 and "hiq_reports"."target_id" = $3 and "hiq_reports"."reporter_id" = $4'
            + ' and "hiq_reports"."status" = $5 and "hiq_reports"."reason" <> $6'
            + ` and position($7::text in coalesce("hiq_reports"."detail", '')) = 0)`,
        );
        // 덧붙이는 줄은 운영자가 읽는 말(사유 이름)로 — 신고 화면·큐와 같은 이름이다
        expect(params).toEqual(["[추가 신고] 욕설·비방", "member", TARGET, REPORTER, "pending", "abuse", "[추가 신고] 욕설·비방"]);
        expect(params.some((p) => p instanceof Date)).toBe(false);
    });

    it("상세를 같이 보내면 사유 뒤에 붙는다", async () => {
        const { params } = await appended({ reason: "privacy", detail: "1:1 방에서 전화번호를 올림" });
        expect(params[0]).toBe("[추가 신고] 개인정보 노출: 1:1 방에서 전화번호를 올림");
        expect(params[6]).toBe(params[0]);
        expect(params[5]).toBe("privacy");
    });

    it("사유마다 덧붙이는 줄이 다르다 — 같은 사유를 다시 누르면 같은 줄이라 문장의 조건이 거른다", async () => {
        const notes = new Set<string>();
        for (const reason of ["abuse", "gambling", "trade", "privacy", "spam", "other"]) {
            calls.inserts.length = 0; calls.updates.length = 0;
            const { params } = await appended({ reason });
            expect(String(params[0]).startsWith("[추가 신고] "), reason).toBe(true);
            expect(String(params[0]).length, reason).toBeGreaterThan("[추가 신고] ".length);
            notes.add(String(params[0]));
        }
        expect(notes.size).toBe(6);
    });

    it("돌려주는 값은 그대로다 — 자동 가림 없음, 다른 표는 건드리지 않는다", async () => {
        calls.reporters = 5;
        const { r, u } = await appended({ reason: "abuse" });
        expect(r).toEqual({ reportCount: 5, autoBlinded: false, authorId: null });
        expect(u.table).toBe(hiqReports);
    });

    it("소스: 0줄일 때만 덧붙인다 — upsert 의 다시 여는 조건은 그대로", () => {
        const src = readFileSync(resolve(__dirname, "community.repo.ts"), "utf8");
        const fn = src.slice(src.indexOf("    async report(opts:"), src.indexOf("    // 이의제기 —"));
        expect(fn).toContain("                .returning({ id: hiqReports.id });");
        expect(fn).toContain("            if (!written.length) {");
        expect(fn).toContain('                        eq(hiqReports.status, "pending"),');
        expect(fn).toContain("sql`${hiqReports.reason} <> ${opts.reason}`,");
        expect(fn).toContain("sql`position(${note}::text in coalesce(${hiqReports.detail}, '')) = 0`,");
        expect(fn.split("db.update(hiqReports)").length - 1).toBe(1);
        expect(src).toContain("const REPORT_DETAIL_MAX = 1000;");
    });
});

describe("(나) 다른 대상 — 예전 그대로 동일인 중복을 무시한다", () => {
    const others = hiqReports.targetType.enumValues.filter((t) => t !== "member");

    it("member 말고 열 가지가 있다", () => {
        expect(others).toHaveLength(10);
        expect(hiqReports.targetType.enumValues).toContain("member");
    });

    it.each(others)("%s — on conflict do nothing, 다시 여는 설정 없음", async (targetType) => {
        await report(targetType, { detail: "x" });
        expect(calls.inserts).toHaveLength(1);
        const [ins] = calls.inserts;
        expect(ins.conflict).toBe("nothing");
        expect(ins.config).toBeUndefined();
        expect(ins.values).toEqual({ targetType, targetId: TARGET, reporterId: REPORTER, reason: "abuse", detail: "x" });
        // 상세 덧붙임은 회원 신고에만 있다
        expect(calls.updates).toEqual([]);
        const text = render.insert(hiqReports).values(ins.values).onConflictDoNothing().toSQL().sql.replace(/\s+/g, " ");
        expect(text.endsWith(" on conflict do nothing")).toBe(true);
        expect(text).not.toContain("do update");
    });

    it("소스: 갈림은 member 하나뿐이고, 나머지 문장은 한 글자도 그대로다", () => {
        const src = readFileSync(resolve(__dirname, "community.repo.ts"), "utf8");
        const fn = src.slice(src.indexOf("    async report(opts:"), src.indexOf("    // 이의제기 —"));
        expect(fn).toContain('if (opts.targetType === "member") {');
        expect(fn).toContain("                .onConflictDoNothing(); // 동일인 중복 신고는 무시");
        expect(fn.split("onConflictDoUpdate(").length - 1).toBe(1);
        expect(fn.split("onConflictDoNothing(").length - 1).toBe(1);
        expect(fn).toContain("setWhere: sql`${hiqReports.status} <> 'pending'`,");
        expect(fn).toContain('set: { status: "pending", reason: opts.reason, detail: opts.detail ?? null, createdAt: sql`now()` },');
        // 신고자 수 집계와 자동 블라인드 분기는 그대로
        expect(fn).toContain("count: sql<number>`count(DISTINCT ${hiqReports.reporterId})::int`");
        expect(fn).toContain("// crew_* / member 신고는 자동 블라인드 없이 어드민 검토 큐에 쌓인다");
    });
});

describe("(다) 다시 연 신고가 큐·알림에 닿는 길 — 손대지 않은 쪽의 식", () => {
    const admin = readFileSync(resolve(__dirname, "admin.repo.ts"), "utf8");

    it("큐: 미처리는 pending 행 수, 기다린 시각은 pending 행의 created_at — 다시 연 행이 '지금 들어온 신고'로 선다", () => {
        expect(admin).toContain("count(*) FILTER (WHERE r.status = 'pending')::int AS pending,");
        expect(admin).toContain("min(r.created_at) FILTER (WHERE r.status = 'pending') AS oldest_pending_at,");
    });

    it("운영자 알림: '방금 들어온 신고'는 그 신고자 행의 created_at 2분 창 — 다시 열면 시각이 지금이라 알림이 간다", () => {
        expect(admin).toContain("AND created_at > now() - interval '2 minutes') AS \"freshReport\",");
        // pending 을 다시 눌렀을 때는 시각이 안 바뀌어 이 창 밖이다 → 알림 없음(예전과 같다).
        // 사유가 다르면 상세에 한 줄만 덧붙는다((가-2)) — created_at 은 그대로라 이 창에도, 큐의 기다린 시각에도 영향이 없다.
    });

    it("닫기는 pending 만 닫는다 — 다시 연 행을 운영자가 다시 판단할 수 있다", () => {
        const close = admin.slice(admin.indexOf("async closeReports("), admin.indexOf("async logModerationAction("));
        expect(close).toContain('eq(hiqReports.status, "pending")');
    });
});
