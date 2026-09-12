/**
 * 핸디전 참가 확인(2026-09-12). 임시 회원 둘을 만들어 한쪽에 대전 기록을 심고,
 * 방을 만들어 참가시켜 **서버가 두 사람 목표를 각각 정하는지** 본다. 끝나면 만든 것을 전부 지운다.
 * 실전 테이블(hiq_games·hiq_game_history)은 건드리지 않는다.
 *
 *   npx tsx scripts/sim-e2e/handicap-join.ts [base]
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";

const BASE = process.argv[2] || "http://localhost:5001";
const secret = process.env.COOKIE_SECRET!;
const sig = (v: string) => createHmac("sha256", secret).update(v).digest("base64").replace(/=+$/, "");
const cookie = (id: string) => `hiq_user_id=s%3A${id}.${encodeURIComponent(sig(id))}`;
const api = async (id: string, path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`${BASE}/api/hiq${path}`, {
        method, headers: { cookie: cookie(id), ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) as any };
};

const [{ store_id }] = (await db.execute(sql`select store_id from hiq_members where id='02fce921-5170-4c0e-9cc2-5be2906f0bb0'`)).rows as { store_id: string }[];
const mk = async (name: string, phone: string) =>
    ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store_id}, ${phone}, ${name}) returning id`)).rows[0] as { id: string }).id;

const tag = process.pid.toString(36);
const strong = await mk("핸디테스트고수", `000-e2e-h1-${tag}`);
const weak = await mk("핸디테스트하수", `000-e2e-h2-${tag}`);
const made: string[] = [];

try {
    // 고수에게 끝난 대전 기록을 심는다: 4구 20캐롬(200점) / 20이닝 → 에버 1.0
    const st = (score: number, innings: number) => JSON.stringify({ players: [{ id: strong, score, innings }, { id: weak, score: 10, innings }] });
    const m1 = (await db.execute(sql`
        insert into hiq_sim_matches (code, host_id, guest_id, game_type, table_id, rules, host_target, guest_target, status, state,
                                     engine_version, params_hash, finished_at, handicap)
        values (${sql.raw(`'${(Math.floor(Math.random()*900000)+100000)}'`)}, ${strong}, ${weak}, '4c', 'JUNGDAE_KR', ${sql.raw("'{\"gameType\":\"4c\",\"pointUnit\":10,\"threeCushionDouble\":false,\"passiveOpponentContactIsFoul\":false,\"foulPenaltyUnits\":1}'::jsonb")},
                200, 100, 'finished', ${sql.raw(`'${st(200, 20)}'::jsonb`)}, 'e2e', 'h', now(), false)
        returning id`)).rows[0] as { id: string };
    made.push(m1.id);
    // 하수에게도 기록: 4구 5캐롬(50점) / 25이닝 → 에버 0.2
    const st2 = JSON.stringify({ players: [{ id: weak, score: 50, innings: 25 }, { id: strong, score: 200, innings: 25 }] });
    const m2 = (await db.execute(sql`
        insert into hiq_sim_matches (code, host_id, guest_id, game_type, table_id, rules, host_target, guest_target, status, state,
                                     engine_version, params_hash, finished_at, handicap)
        values (${sql.raw(`'${(Math.floor(Math.random()*900000)+100000)}'`)}, ${weak}, ${strong}, '4c', 'JUNGDAE_KR', ${sql.raw("'{\"gameType\":\"4c\",\"pointUnit\":10,\"threeCushionDouble\":false,\"passiveOpponentContactIsFoul\":false,\"foulPenaltyUnits\":1}'::jsonb")},
                100, 200, 'finished', ${sql.raw(`'${st2}'::jsonb`)}, 'e2e', 'h', now(), false)
        returning id`)).rows[0] as { id: string };
    made.push(m2.id);

    console.log("고수 다마:", (await api(strong, "/sim/handicap")).json?.data?.boards?.find((b: any) => b.gameType === "4c"));
    console.log("하수 다마:", (await api(weak, "/sim/handicap")).json?.data?.boards?.find((b: any) => b.gameType === "4c"));

    // 고수가 방을 만들고(비공개 — 방송 푸시 없음) 하수가 참가
    const created = await api(strong, "/sim/matches", "POST", {
        gameType: "4c", tableId: "JUNGDAE_KR", cushionModel: "han2005", condition: 1,
        finishType: "none", target: 100, inningCap: 0, aimAssist: true, fullPreview: false, isPublic: false, handicap: true,
    });
    if (created.status >= 300) throw new Error("방 만들기 실패 " + created.status + " " + JSON.stringify(created.json));
    const room = created.json.data;
    made.push(room.id);
    console.log("방 만듦: handicap =", room.handicap, "· 방장 다마(참가 전) =", room.hostTarget);

    // 비공개 방은 코드로 참가한다(id 참가는 멀티방 목록 전용)
    const joined = await api(weak, `/sim/matches/code/${room.code}/join`, "POST", {});
    if (joined.status >= 300) throw new Error("참가 실패 " + joined.status + " " + JSON.stringify(joined.json));
    const m = joined.json.data;
    console.log("참가 뒤 →  방장(고수) 다마:", m.hostTarget, "· 게스트(하수) 다마:", m.guestTarget);
    console.log("세션 목표:", m.state.players.map((p: any) => p.target));
} finally {
    await new Promise((r) => setTimeout(r, 2000));   // 참가 알림이 응답 뒤에 저장된다 — 먼저 끝나길 기다린다
    // 회원을 참조하는 대전을 통째로 지운다 — API 로 만든 방까지(만들다 실패해도 남지 않게)
    // 참가 알림이 회원을 참조한다 — 먼저 지운다
    await db.execute(sql`delete from hiq_notifications where member_id in (${strong}, ${weak})`);
    await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id in (${strong}, ${weak}) or guest_id in (${strong}, ${weak}))`);
    await db.execute(sql`delete from hiq_sim_matches where host_id in (${strong}, ${weak}) or guest_id in (${strong}, ${weak})`);
    await db.execute(sql`delete from hiq_sim_match_ratings where member_id in (${strong}, ${weak})`);
    await db.execute(sql`delete from hiq_sim_ratings where member_id in (${strong}, ${weak})`);
    await db.execute(sql`delete from hiq_members where id in (${strong}, ${weak})`);
    console.log("정리 완료 — 임시 회원·대전 삭제");
}
process.exit(0);
