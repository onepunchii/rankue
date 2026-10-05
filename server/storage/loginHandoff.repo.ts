/**
 * '앱에서 열기' 로그인 넘겨주기의 저장소(2026-10-06) — 규칙은 shared/loginHandoff, 라우트는 routes/modules/handoff.ts.
 *
 * 여기로 들어오는 것은 **토큰의 해시뿐**이다(sha256 hex). 토큰 원문은 라우트 밖으로 나오지 않는다 — 이 파일의 어떤 함수도 원문을 받지 않는다.
 * 시각 비교는 전부 DB 의 now() 로 한다. JS Date 를 raw sql 에 넣지 않는다(KST 기기에서 9시간 어긋나는 함정) —
 * 만료·사용 판정이 서버 인스턴스의 시계와 무관해지는 덤도 있다.
 */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import { hiqLoginHandoffs } from "../../shared/schema.js";

/** 만료된 지 이만큼 지난 행은 누구 것이든 지운다 — 한 번 받고 다시 오지 않는 회원의 행이 남지 않게. */
const SWEEP_EXPIRED_AFTER_SEC = 24 * 60 * 60;

/**
 * 청소. 토큰을 발급할 때마다 부른다: 그 회원의 keepSec 넘은 행(발급 횟수를 세는 창 밖)과, 만료된 지 하루 넘은 행(모든 회원).
 * 창 안의 행은 쓰였든 만료됐든 남긴다 — 그 수가 곧 '최근에 몇 번 받았나'다.
 */
export async function sweepLoginHandoffs(memberId: string, keepSec: number): Promise<void> {
    await db.delete(hiqLoginHandoffs).where(or(
        and(eq(hiqLoginHandoffs.memberId, memberId), sql`${hiqLoginHandoffs.createdAt} < now() - make_interval(secs => ${keepSec})`),
        sql`${hiqLoginHandoffs.expiresAt} < now() - make_interval(secs => ${SWEEP_EXPIRED_AFTER_SEC})`,
    ));
}

/** 이 회원이 최근 windowSec 동안 받은 토큰 수와, 그중 가장 오래된 것이 몇 초 전인지(한도에 걸렸을 때 '몇 초 뒤'를 알려 주려고). */
export async function recentLoginHandoffs(memberId: string, windowSec: number): Promise<{ count: number; oldestAgeSec: number }> {
    const [row] = await db
        .select({
            count: sql<number>`count(*)::int`,
            oldestAgeSec: sql<number>`coalesce(floor(extract(epoch from (now() - min(${hiqLoginHandoffs.createdAt}))))::int, 0)`,
        })
        .from(hiqLoginHandoffs)
        .where(and(
            eq(hiqLoginHandoffs.memberId, memberId),
            sql`${hiqLoginHandoffs.createdAt} > now() - make_interval(secs => ${windowSec})`,
        ));
    return { count: Number(row?.count ?? 0), oldestAgeSec: Number(row?.oldestAgeSec ?? 0) };
}

/** 새 토큰의 해시를 적는다. 만료는 DB 시계로 지금 + ttlSec. */
export async function insertLoginHandoff(memberId: string, tokenHash: string, ttlSec: number): Promise<void> {
    await db.insert(hiqLoginHandoffs).values({
        memberId,
        tokenHash,
        expiresAt: sql`now() + make_interval(secs => ${ttlSec})`,
    });
}

/**
 * 토큰을 쓴다 — **한 번만**. 아직 안 썼고 만료 전인 행을 '썼음'으로 바꾸면서 회원 id 를 받아 온다.
 * 한 문장(UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING)이라 동시에 두 요청이 와도 하나만 행을 얻는다:
 * 뒤에 온 쪽은 앞의 것이 끝날 때까지 기다렸다가 조건을 다시 보고(이미 used_at 이 찼다) 빈 손으로 돌아간다.
 * 없는 토큰·만료·이미 쓴 토큰은 전부 null — 부르는 쪽이 구분할 수 없고, 구분해서도 안 된다.
 */
export async function redeemLoginHandoff(tokenHash: string): Promise<string | null> {
    const rows = await db
        .update(hiqLoginHandoffs)
        .set({ usedAt: sql`now()` })
        .where(and(
            eq(hiqLoginHandoffs.tokenHash, tokenHash),
            isNull(hiqLoginHandoffs.usedAt),
            sql`${hiqLoginHandoffs.expiresAt} > now()`,
        ))
        .returning({ memberId: hiqLoginHandoffs.memberId });
    return rows[0]?.memberId ?? null;
}
