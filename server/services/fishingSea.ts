/**
 * 오늘의 바다 — 기상청 특보 현황을 받아 해역 일곱 곳의 지금으로 읽는다(2026-10-14).
 *
 * 자료: 공공데이터포털 기상청_기상특보 조회서비스 getPwnStatus(키 DATA_GO_KR_KEY — 골프 날씨와 같은 키, 없으면 조용히 null).
 * 받아 오는 때: 화면을 열 때 가진 것이 15분보다 낡았으면 그 자리에서 한 번(4초까지). 실패하면 가진 것을 그대로 주고
 *   5분 동안은 다시 조르지 않는다. 한 시간 넘게 낡았으면 stale 로 알린다. 가진 것이 없고 받지도 못하면 null(화면은 판을 그리지 않는다).
 * 읽는 규칙은 shared/fishingSea(순수 함수). 글의 꼴이 바뀌어 읽지 못하면 '특보 없음'으로 보이지 않게 null 을 준다.
 * 표는 migrations/fishing_sea_status.sql.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { kma } from "./golfWeather.js";
import { seaBoard, seaIssued, seaReadable, type SeaNow } from "../../shared/fishingSea.js";
import { noteFeed } from "./fishingFeedHealth.js";

const PWN_URL = "https://apis.data.go.kr/1360000/WthrWrnInfoService/getPwnStatus";
const FRESH_MS = 15 * 60_000;
const STALE_MS = 60 * 60_000;
const RETRY_MS = 5 * 60_000;
const rowsOf = (r: any) => (r.rows ?? r) as any[];

interface Saved { t6: string; t7: string; tmFc: string }
let lastTry = 0;

async function read(): Promise<{ data: Saved; ms: number } | null> {
    const [row] = rowsOf(await db.execute(sql`select data, (extract(epoch from fetched_at) * 1000)::bigint as ms from fishing_sea_status where id = 'pwn'`));
    return row?.data && typeof row.data.t6 === "string" ? { data: row.data as Saved, ms: Number(row.ms) } : null;
}

async function fetchPwn(timeoutMs: number): Promise<Saved | null> {
    const r = await kma(PWN_URL, { numOfRows: 10 }, timeoutMs);
    await noteFeed("kma:pwn", r.code === "00", r.code ? `결과 코드 ${r.code}` : "응답 없음");
    const it = r.code === "00" ? r.items[0] : null;
    if (!it || typeof it.t6 !== "string" || !seaReadable(it.t6)) return null;
    return { t6: it.t6, t7: typeof it.t7 === "string" ? it.t7 : "", tmFc: String(it.tmFc ?? "") };
}

export async function getSeaNow(nowMs = Date.now()): Promise<SeaNow | null> {
    let have = await read();
    if ((!have || nowMs - have.ms > FRESH_MS) && nowMs - lastTry > RETRY_MS) {
        lastTry = nowMs;
        const got = await fetchPwn(4000);
        if (got) {
            await db.execute(sql`
                insert into fishing_sea_status (id, data, fetched_at) values ('pwn', ${JSON.stringify(got)}::jsonb, now())
                on conflict (id) do update set data = excluded.data, fetched_at = now()`);
            have = { data: got, ms: nowMs };
        }
    }
    if (!have || !seaReadable(have.data.t6)) return null;
    return { areas: seaBoard(have.data.t6, have.data.t7), issued: seaIssued(have.data.tmFc), stale: nowMs - have.ms > STALE_MS };
}
