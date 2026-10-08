import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { isBotUA } from "../../lib/visitorBots.js";
import { TRAIL_BATCH_MAX, cleanTrailEvent, isTrailVisitor, type TrailRow } from "../../../shared/uiTrail.js";

/**
 * 방문자 발자국 수집(2026-10-08) — POST /api/ui-event/batch { visitor, session, events: [{ n, p, m, t }] }
 * 인증 없음(가입하지 않은 방문자가 대상). 화면(client Tracker)이 화면 이동·누른 단추·스크롤 깊이를 모아 20초마다 한 번에 보낸다.
 *
 *  · 무엇을 받고 버리는지는 shared/uiTrail(cleanTrailEvent)이 정한다 — 화면이 이미 걸렀어도 서버가 한 번 더 본다.
 *  · 봇(UA)은 받지 않는다. IP 는 **저장하지 않고** 분당 한도(대량 주입 막기)를 세는 데에만 잠깐 쓴다.
 *  · 로그인한 사람이면 서명 쿠키의 회원 id 를 같이 남긴다 — 관리자 화면이 회원/비회원을 가른다.
 *  · 저장 시각은 묶음 안의 순서를 지킨다: 서버 시각에서 (묶음 길이 − 그 줄의 자리)만큼 뺀다. 기기 시계는 믿지 않는다.
 *  · 응답은 항상 204. 실패해도 화면은 아무 일 없어야 한다(부가 기능).
 *  · 60일이 지난 줄은 하루 한 번 도는 정리 크론(/api/cron/sim-cleanup)이 지운다.
 */
const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 한 묶음이 덮을 수 있는 시간 — 화면은 20초마다 보내지만 탭이 잠들었다 깨면 길어진다 */
const SPAN_MAX_MS = 30 * 60_000;
/** IP 하나가 1분에 보낼 수 있는 묶음 수 */
const PER_MINUTE = 30;
let windowStart = Date.now();
const hits = new Map<string, number>();

router.post("/ui-event/batch", async (req: any, res) => {
    try {
        if (isBotUA(req.get("user-agent"))) return res.status(204).end();
        const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.ip || "unknown";
        const now = Date.now();
        if (now - windowStart > 60_000) { windowStart = now; hits.clear(); }
        const n = (hits.get(ip) ?? 0) + 1; hits.set(ip, n);
        if (n > PER_MINUTE) return res.status(204).end();

        const body = req.body ?? {};
        if (!isTrailVisitor(body.visitor) || !Array.isArray(body.events)) return res.status(204).end();
        const visitor: string = body.visitor;
        const session = typeof body.session === "string" && /^[A-Za-z0-9]{1,12}$/.test(body.session) ? body.session : null;
        const cookie = req.signedCookies?.hiq_user_id;
        const memberId = typeof cookie === "string" && UUID.test(cookie) ? cookie : null;

        const kept: { row: TrailRow; t: number }[] = [];
        for (const e of body.events.slice(0, TRAIL_BATCH_MAX)) {
            const row = cleanTrailEvent(e);
            if (!row) continue;
            const t = Number((e as any)?.t);
            kept.push({ row, t: Number.isFinite(t) ? t : NaN });
        }
        if (kept.length === 0) return res.status(204).end();

        const times = kept.map((k) => k.t).filter((t) => Number.isFinite(t));
        const t0 = times.length ? Math.min(...times) : 0;
        const span = times.length ? Math.min(Math.max(...times) - t0, SPAN_MAX_MS) : 0;
        const values = kept.map(({ row, t }) => {
            const offset = Number.isFinite(t) ? Math.max(0, Math.min(t - t0, span)) : span;
            const meta = session ? { ...row.meta, s: session } : row.meta;
            return sql`(${row.name}, ${visitor}, ${memberId}::uuid, ${row.path}, ${JSON.stringify(meta)}::jsonb, now() - make_interval(secs => ${(span - offset) / 1000}))`;
        });
        await db.execute(sql`insert into ui_events (name, visitor, member_id, path, meta, created_at) values ${sql.join(values, sql`, `)}`);
    } catch (e) {
        console.warn("[ui-event/batch] 저장 실패:", String((e as Error)?.message ?? e).slice(0, 120));
    }
    return res.status(204).end();
});

export default router;
