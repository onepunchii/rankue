import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { checkSuperAdmin } from "../../middleware/adminAuth.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { isTrailVisitor, pageKind } from "../../../shared/uiTrail.js";

/**
 * 관리자 콘솔 '방문자 발자국'(2026-10-08 오너: "[폴리] 어드민 보면 방문자 발자국 만들어 놓은 것처럼 우리 랭큐도") — /api/hiq/admin/visitors/*
 * 화면(client Tracker)이 모은 ui_events(page·click·scroll·open)를 읽는다. 전부 GET — 보기 전용 관리자도 본다.
 *
 *  · 사람 = 브라우저 하나(방문자 난수 ID). 회원 id 가 한 번이라도 붙은 방문자는 회원으로 본다.
 *  · 주소는 화면 종류로 묶는다(/golf/course/세레니티CC → "/golf/course/…", shared pageKind) — 낱개로 세면 상위가 전부 1건이다.
 *  · created_at 은 timestamptz 다(이 표만). 날짜 경계는 한국 자정을 timestamptz 로 바꿔 견준다 — 인덱스를 탄다.
 *  · 발자국은 60일만 둔다(정리 크론). 통계는 그 안에서만 본다.
 */
const router = Router();
router.use(checkSuperAdmin);

type Who = "guest" | "member" | "all";
const daysOf = (v: unknown) => { const n = parseInt(String(v), 10); return [1, 7, 30].includes(n) ? n : 1; };
const whoOf = (v: unknown): Who => (v === "member" ? "member" : v === "all" ? "all" : "guest");
/** 기간 시작 — 한국 자정(1 = 오늘). timestamptz */
const since = (days: number) => sql`((date_trunc('day', now() at time zone 'Asia/Seoul') - make_interval(days => ${days - 1})) at time zone 'Asia/Seoul')`;
const KST = sql`(created_at at time zone 'Asia/Seoul')`;
const AT = (col: ReturnType<typeof sql>) => sql`to_char(${col} at time zone 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI:SS')`;
const pickOf = (who: Who) => (who === "all" ? sql`true` : who === "member" ? sql`member` : sql`not member`);
const rowsOf = <T = any>(r: unknown): T[] => ((r as { rows?: T[] })?.rows ?? []);

/** 요약 — 사람 수·본 화면·누른 것·들어온 곳·나간 곳·유입처·가입까지 */
router.get("/summary", asyncHandler(async (req: any, res: any) => {
    const days = daysOf(req.query.days), who = whoOf(req.query.who);
    // 기간 안 발자국을 방문자별로 접는다
    const base = sql`
        with ev as (
            select id, name, visitor, member_id, path, meta, created_at from ui_events where created_at >= ${since(days)}
        ), v as (
            select visitor, bool_or(member_id is not null) as member,
                   count(*) filter (where name = 'page')::int as pages, count(*) filter (where name = 'click')::int as clicks,
                   bool_or(name = 'open') as opened, min(created_at) as first_at, max(created_at) as last_at,
                   -- 그 기간 첫 줄에 회원 id 가 없었나 = 비회원으로 왔나(뒤에 로그인하면 member 는 true 가 된다)
                   ((array_agg(member_id order by created_at, id))[1] is null) as came_guest
            from ev group by visitor
        ), pick as (select visitor from v where ${pickOf(who)})`;
    const inPick = sql`visitor in (select visitor from pick)`;

    const [totals, pages, clicks, entries, exits, hours, refs, signups, daily] = await Promise.all([
        db.execute(sql`${base}
            select count(*)::int as visitors, count(*) filter (where member)::int as members, count(*) filter (where not member)::int as guests,
                   count(*) filter (where ${inPick})::int as picked,
                   coalesce(sum(pages) filter (where ${inPick}), 0)::int as pv,
                   count(*) filter (where ${inPick} and pages <= 1)::int as one,
                   count(*) filter (where ${inPick} and pages >= 2)::int as more,
                   count(*) filter (where ${inPick} and clicks > 0)::int as clicked,
                   count(*) filter (where ${inPick} and opened)::int as opened,
                   coalesce(avg(extract(epoch from (last_at - first_at))) filter (where ${inPick} and pages > 1), 0)::int as stay,
                   count(*) filter (where came_guest)::int as "cameGuest",
                   count(*) filter (where came_guest and pages >= 2)::int as "guestMore",
                   count(*) filter (where came_guest and opened)::int as "guestOpened",
                   count(*) filter (where came_guest and member)::int as "guestJoined"
            from v`).then((r) => rowsOf(r)[0] ?? {}),
        db.execute(sql`${base}
            select path, count(*)::int as views, count(distinct visitor)::int as people from ev
            where name = 'page' and ${inPick} group by path order by 2 desc limit 600`).then(rowsOf),
        db.execute(sql`${base}
            select meta->>'l' as label, meta->>'h' as href, path, count(*)::int as n, count(distinct visitor)::int as people from ev
            where name = 'click' and ${inPick} group by 1, 2, 3 order by 4 desc limit 800`).then(rowsOf),
        db.execute(sql`${base}
            select path, count(*)::int as n from (select distinct on (visitor) visitor, path from ev where name = 'page' and ${inPick} order by visitor, created_at, id) x
            group by path order by 2 desc limit 400`).then(rowsOf),
        db.execute(sql`${base}
            select path, count(*)::int as n from (select distinct on (visitor) visitor, path from ev where name = 'page' and ${inPick} order by visitor, created_at desc, id desc) x
            group by path order by 2 desc limit 400`).then(rowsOf),
        db.execute(sql`${base}
            select extract(hour from ${KST})::int as h, count(distinct visitor)::int as n from ev
            where ${inPick} and created_at >= ${since(1)} group by 1`).then(rowsOf),
        // 유입처는 그 방문의 첫 화면에만 붙는다(기기 w 가 같이 붙는 줄)
        db.execute(sql`${base}
            select coalesce(meta->>'ref', '(직접·앱)') as ref, count(distinct visitor)::int as n from ev
            where name = 'page' and meta ? 'w' and ${inPick} group by 1 order by 2 desc limit 12`).then(rowsOf),
        // 같은 기간 새 회원 — hiq_members.created_at 은 시간대 없는 UTC 다
        db.execute(sql`select count(*)::int as n from hiq_members where (created_at at time zone 'UTC') >= ${since(days)}`).then((r) => Number(rowsOf(r)[0]?.n ?? 0)),
        db.execute(sql`
            select to_char(${KST}, 'MM.DD') as d, count(distinct visitor) filter (where member_id is null)::int as guests, count(distinct visitor) filter (where member_id is not null)::int as members
            from ui_events where created_at >= ${since(Math.max(days, 7))} group by 1 order by 1`).then(rowsOf),
    ]);

    const fold = (rows: any[], keys: string[]) => {
        const m = new Map<string, Record<string, number>>();
        for (const r of rows) {
            const kind = pageKind(r.path);
            const a = m.get(kind) ?? (m.set(kind, Object.fromEntries(keys.map((k) => [k, 0]))), m.get(kind)!);
            for (const k of keys) a[k] += Number(r[k] ?? 0);
        }
        return [...m].map(([kind, v]) => ({ kind, ...v })) as any[];
    };
    const clickMap = new Map<string, { label: string; kind: string; to: string | null; n: number; people: number }>();
    for (const r of clicks) {
        const kind = pageKind(r.path), to = r.href ? (String(r.href).startsWith("↗") ? String(r.href) : pageKind(String(r.href))) : null;
        const key = `${r.label}|${kind}|${to ?? ""}`;
        const a = clickMap.get(key) ?? (clickMap.set(key, { label: String(r.label ?? ""), kind, to, n: 0, people: 0 }), clickMap.get(key)!);
        a.n += Number(r.n ?? 0); a.people += Number(r.people ?? 0);
    }
    const hourly = Array.from({ length: 24 }, (_, h) => Number(hours.find((x: any) => Number(x.h) === h)?.n ?? 0));
    return sendSuccess(res, {
        days, who, totals,
        pages: fold(pages, ["views", "people"]).sort((a, b) => b.views - a.views).slice(0, 25),
        clicks: [...clickMap.values()].sort((a, b) => b.n - a.n).slice(0, 40),
        entries: fold(entries, ["n"]).sort((a, b) => b.n - a.n).slice(0, 12),
        exits: fold(exits, ["n"]).sort((a, b) => b.n - a.n).slice(0, 12),
        hourly, refs, signups, daily,
    });
}));

/** 최근 방문자 — 한 줄이 한 사람(브라우저). 들어온 화면·본 화면 수·누른 수·마지막 화면 */
router.get("/list", asyncHandler(async (req: any, res: any) => {
    const days = daysOf(req.query.days), who = whoOf(req.query.who);
    const rows = rowsOf(await db.execute(sql`
        with ev as (
            select id, name, visitor, member_id, path, meta, created_at from ui_events where created_at >= ${since(days)}
        ), v as (
            select visitor, bool_or(member_id is not null) as member, (array_agg(member_id) filter (where member_id is not null))[1] as member_id,
                   count(*) filter (where name = 'page')::int as pages, count(*) filter (where name = 'click')::int as clicks,
                   bool_or(name = 'open') as opened, min(created_at) as first_at, max(created_at) as last_at,
                   (array_agg(path order by created_at, id) filter (where name = 'page'))[1] as entry,
                   (array_agg(path order by created_at desc, id desc) filter (where name = 'page'))[1] as exit,
                   max(meta->>'ref') as ref, max(meta->>'w') as device
            from ev group by visitor
        )
        select v.visitor, v.member, v.member_id as "memberId", v.pages, v.clicks, v.opened,
               ${AT(sql`v.first_at`)} as "firstAt", ${AT(sql`v.last_at`)} as "lastAt",
               extract(epoch from (v.last_at - v.first_at))::int as stay, v.entry, v.exit, v.ref, v.device, m.name
        from v left join hiq_members m on m.id = v.member_id
        where ${who === "all" ? sql`true` : who === "member" ? sql`v.member` : sql`not v.member`}
        order by v.last_at desc limit 200`));
    // firstAt·lastAt 은 한국 시각 글자("2026-10-08T14:03:11")다 — 화면이 그대로 쓴다
    return sendSuccess(res, rows);
}));

/** 한 사람의 발자국 — 시간순(최근 30일, 400줄까지) */
router.get("/trail/:visitor", asyncHandler(async (req: any, res: any) => {
    const v = String(req.params.visitor);
    if (!isTrailVisitor(v)) return sendError(res, 400, "잘못된 요청입니다");
    const rows = rowsOf(await db.execute(sql`
        select id, name, path, meta, ${AT(sql`created_at`)} as at, (member_id is not null) as member
        from ui_events where visitor = ${v} and created_at >= ${since(30)}
        order by created_at desc, id desc limit 400`));
    // 처음 온 날 — 하루 한 번 보내는 방문 비콘(daily_visits)이 같은 방문자 ID 를 쓴다
    const first = rowsOf(await db.execute(sql`select min(day)::text as day from daily_visits where visitor = ${v}`).catch(() => ({ rows: [] })))[0];
    return sendSuccess(res, { visitor: v, firstDay: first?.day ?? null, events: rows.reverse() });
}));

export default router;
