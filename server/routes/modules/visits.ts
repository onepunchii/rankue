import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../db.js";
import { dailyVisits } from "../../../shared/schema.js";

const router = Router();

// --- 일별 유니크 접속자 비콘 ---
// POST /api/visit  { v: string }
// 인증: 없음 (익명 허용 — 가입하지 않은 방문자를 세는 것이 목적이다)
//
// 클라이언트(client/src/components/hiq/VisitBeacon.tsx)가 localStorage 로 게이트해서
// **하루 한 번만** 호출한다. 그래서 이 라우트는 트래픽이 아니라 "그날 온 사람 수"만큼 호출된다.
// 페이지 이동마다 쓰면 트래픽이 늘수록 DB 비용·지연이 같이 늘어난다.
//
// 저장하는 것은 클라이언트가 만든 난수 ID 하나뿐이다. IP·계정·경로는 저장하지 않는다.
router.post("/visit", async (req, res) => {
    try {
        const raw = (req.body ?? {}).v;
        const v = typeof raw === "string" ? raw.trim() : "";
        // 64자 제한 — UUID(36자)면 충분하고, 긴 값으로 테이블을 부풀리는 것을 막는다.
        if (!v || v.length > 64) return res.status(400).json({ error: "v is required" });

        // day 는 KST 기준. (day, visitor) PK 충돌은 무시 → 같은 사람이 같은 날 여러 번 보내도 1행.
        await db.execute(sql`
            insert into daily_visits (day, visitor)
            values ((now() at time zone 'Asia/Seoul')::date, ${v})
            on conflict (day, visitor) do nothing
        `);
        return res.json({ ok: true });
    } catch {
        // 집계 실패로 사용자 요청을 깨뜨리지 않는다(부가 기능).
        // 집계가 안 되는 상황은 대시보드에서 "미설정"으로 드러난다(super.ts 참고).
        return res.json({ ok: true });
    }
});

// --- 검색 유입 → 가입 깔때기(2026-09-27) ---
const isUndefinedTable = (e: any) => (e?.code ?? e?.cause?.code) === "42P01" || /relation "promo_events" does not exist/.test(String(e?.message ?? ""));
let promoTable: Promise<unknown> | null = null;
function ensurePromoTable() {
    promoTable ??= (async () => {
        await db.execute(sql`
            create table if not exists promo_events (
              day date not null, src text not null, step text not null, visitor text not null,
              first_seen timestamp not null default now(),
              primary key (day, src, step, visitor)
            )
        `);
        await db.execute(sql`create index if not exists promo_events_day_idx on promo_events (day)`);
    })().catch((e) => { promoTable = null; throw e; });
    return promoTable;
}

// POST /api/promo-event { v, src, step } — 매장·선수 페이지 '길 찾기' 배너의 단계(shared/promoFunnel.ts).
// 인증 없음(가입 전 방문자가 대상). 저장하는 것은 난수 방문자 id·출처·단계뿐이고, 클라가 단계마다 하루 한 번만 보낸다.
// (day, src, step, visitor) 충돌은 무시 — 같은 사람이 같은 날 여러 번 보내도 1행. 값은 정해진 목록만 받는다.
router.post("/promo-event", async (req, res) => {
    try {
        const { isPromoSrc, isPromoStep } = await import("../../../shared/promoFunnel.js");
        const body = req.body ?? {};
        const v = typeof body.v === "string" ? body.v.trim() : "";
        if (!v || v.length > 64 || !isPromoSrc(body.src) || !isPromoStep(body.step)) return res.status(400).json({ error: "bad event" });
        const insert = () => db.execute(sql`
            insert into promo_events (day, src, step, visitor)
            values ((now() at time zone 'Asia/Seoul')::date, ${body.src}, ${body.step}, ${v})
            on conflict do nothing
        `);
        try {
            await insert();
        } catch (e: any) {
            // 표가 아직 없으면(42P01) 한 번 만들고 다시 넣는다 — migrations/promo_events.sql 과 같은 DDL(추가만, 멱등).
            // 오너가 SQL 을 따로 돌리지 않아도 첫 집계에서 생긴다(2026-09-27 오너: "직접 해 줘").
            if (!isUndefinedTable(e)) throw e;
            await ensurePromoTable();
            await insert();
        }
        return res.json({ ok: true });
    } catch {
        // 부가 기능 — 표가 없거나 DB 가 느려도 화면을 깨뜨리지 않는다
        return res.json({ ok: true });
    }
});

export default router;
