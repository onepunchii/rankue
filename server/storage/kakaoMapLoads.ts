/**
 * 카카오 지도 하루 사용 수(표 kakao_map_loads — migrations/kakao_map_loads.sql). 규칙은 shared/kakaoMap.ts.
 * 한 줄을 한 번의 질의로 올린다 — 상한 아래일 때만 +1(동시에 여럿이 눌러도 상한을 넘지 않는다).
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const TODAY = sql`(now() at time zone 'Asia/Seoul')::date`;

/** 오늘 한 칸을 쓴다 — 상한 아래면 true. 상한에 걸리면 거절 수만 올리고 false */
export async function takeKakaoMapLoad(cap: number): Promise<boolean> {
    if (cap <= 0) return false;
    const got = rowsOf(await db.execute(sql`
        insert into kakao_map_loads (day, loads) values (${TODAY}, 1)
        on conflict (day) do update set loads = kakao_map_loads.loads + 1, updated_at = now()
        where kakao_map_loads.loads < ${cap}
        returning loads`));
    if (got.length > 0) return true;
    await db.execute(sql`update kakao_map_loads set refused = refused + 1, updated_at = now() where day = ${TODAY}`);
    return false;
}

/** 로드뷰 · 근처 장소의 오늘 한 칸(표 kakao_api_calls — 하루 · 종류마다 한 줄). 지도와 같은 규칙: 상한 아래일 때만 +1 */
export async function takeKakaoCall(kind: "roadview" | "local", cap: number): Promise<boolean> {
    if (cap <= 0) return false;
    const got = rowsOf(await db.execute(sql`
        insert into kakao_api_calls (day, kind, calls) values (${TODAY}, ${kind}, 1)
        on conflict (day, kind) do update set calls = kakao_api_calls.calls + 1, updated_at = now()
        where kakao_api_calls.calls < ${cap}
        returning calls`));
    if (got.length > 0) return true;
    await db.execute(sql`update kakao_api_calls set refused = refused + 1, updated_at = now() where day = ${TODAY} and kind = ${kind}`);
    return false;
}
