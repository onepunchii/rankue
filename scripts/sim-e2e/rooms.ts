/**
 * 멀티방·비밀번호·푸시 초대 e2e(2026-09-08). 임시 회원 셋(host·guest·friend)을 만들어 실제 API 로:
 *  1) host 가 비밀번호 있는 멀티방을 연다 → guest 목록에 뜬다(hasPassword, code 숨김) → 틀린 비밀번호 403 BAD_PASSWORD → 맞으면 playing
 *  2) host 가 비공개 대전을 열고 friend 에게 초대 → hiq_notifications 에 ?join=<code>&auto=1 링크 → friend 가 코드로 참가(자동 참가 경로)
 *  3) 다른 회원 목록엔 시작된 방이 안 뜬다
 * 끝나면 알림·대전·회원을 전부 지운다(hiq_sim_* + hiq_notifications + hiq_members 만).
 * 실행: `npx tsx scripts/sim-e2e/rooms.ts [base]`
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { createHmac } from "crypto";

const BASE = process.argv[2] || process.env.E2E_BASE || "http://localhost:5001";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sig = (id: string) => encodeURIComponent(createHmac("sha256", secret).update(id).digest("base64").replace(/=+$/, ""));
const cookieFor = (id: string) => `hiq_user_id=s%3A${id}.${sig(id)}`;
async function api(cookie: string, method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j } as { status: number; success?: boolean; data?: any; code?: string; message?: string };
}
const assert = (c: unknown, msg: string) => { if (!c) throw new Error("ASSERT " + msg); console.log("ok  ", msg); };

const store = (await db.execute(sql`select store_id from hiq_members where id=${OWNER}`)).rows[0] as { store_id: string };
const mk = async (phone: string, name: string) => ((await db.execute(sql`insert into hiq_members (store_id, phone, name) values (${store.store_id}, ${phone}, ${name}) returning id`)).rows[0] as { id: string }).id;
const host = await mk("000-e2e-room-h", "방장테스트"), guest = await mk("000-e2e-room-g", "손님테스트"), friend = await mk("000-e2e-room-f", "친구테스트");
const H = cookieFor(host), G = cookieFor(guest), F = cookieFor(friend);
const ids = [host, guest, friend];
try {
  // 1) 비밀번호 멀티방
  const created = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "3c", tableId: "DAEDAE", target: 15, isPublic: true, password: "4444" });
  assert(created.status === 201 && created.data.isPublic === true && created.data.hasPassword === true, "멀티방 만들기(공개·비밀번호)");
  const roomId = created.data.id as string;
  const list = await api(G, "GET", "/api/hiq/sim/rooms");
  const row = (list.data as any[]).find((m) => m.id === roomId);
  assert(list.status === 200 && row && row.hasPassword === true && row.code === "", "손님 목록에 뜬다(비밀번호·코드 숨김)");
  const mine = await api(H, "GET", "/api/hiq/sim/rooms");
  assert(!(mine.data as any[]).some((m) => m.id === roomId), "내 방은 내 목록에 안 뜬다");
  const wrong = await api(G, "POST", `/api/hiq/sim/matches/${roomId}/join`, { target: 18, password: "0000" });
  assert(wrong.status === 403 && wrong.code === "BAD_PASSWORD", "틀린 비밀번호 403 BAD_PASSWORD");
  const noPw = await api(G, "POST", `/api/hiq/sim/matches/${roomId}/join`, { target: 18 });
  assert(noPw.status === 403, "비밀번호 없이 403");
  const joined = await api(G, "POST", `/api/hiq/sim/matches/${roomId}/join`, { target: 18, password: "4444" });
  assert(joined.status === 200 && joined.data.status === "playing" && joined.data.myIndex === 1 && joined.data.guestTarget === 18, "맞는 비밀번호 → playing");
  const after = await api(F, "GET", "/api/hiq/sim/rooms");
  assert(!(after.data as any[]).some((m) => m.id === roomId), "시작된 방은 목록에서 빠진다");

  // 2) 비공개 대전 + 친구 초대(푸시) → 자동 참가 경로(코드)
  const priv = await api(H, "POST", "/api/hiq/sim/matches", { gameType: "4c", tableId: "JUNGDAE_KR", target: 80 });
  assert(priv.status === 201 && priv.data.isPublic === false, "비공개 대전 만들기");
  const privId = priv.data.id as string, code = priv.data.code as string;
  const notMine = await api(G, "POST", `/api/hiq/sim/matches/${privId}/invite`, { memberId: friend });
  assert(notMine.status === 404, "호스트가 아니면 초대 못 함");
  const inv = await api(H, "POST", `/api/hiq/sim/matches/${privId}/invite`, { memberId: friend });
  assert(inv.status === 200 && inv.data.name === "친구테스트", "친구에게 초대");
  let noti: any = null;
  for (let i = 0; i < 25 && !noti; i++) {
    await new Promise((r) => setTimeout(r, 200));
    noti = (await db.execute(sql`select title, body, params from hiq_notifications where member_id=${friend} order by created_at desc limit 1`)).rows[0] ?? null;
  }
  assert(noti && String(noti.params?.url ?? "") === `/online-game?join=${code}&auto=1`, `초대 알림 저장(${noti?.title} / ${noti?.params?.url})`);
  const hidden = await api(G, "GET", "/api/hiq/sim/rooms");
  assert(!(hidden.data as any[]).some((m) => m.id === privId), "비공개 대전은 목록에 없다");
  const byId = await api(G, "POST", `/api/hiq/sim/matches/${privId}/join`, {});
  assert(byId.status === 404, "초대받지 않은 사람은 id 로 못 들어온다");
  const look = await api(F, "GET", `/api/hiq/sim/matches/code/${code}`);
  assert(look.status === 200 && look.data.hasPassword === false && look.data.myIndex === -1, "친구가 코드 조회");
  const auto = await api(F, "POST", `/api/hiq/sim/matches/code/${code}/join`, { target: 80 });
  assert(auto.status === 200 && auto.data.status === "playing", "친구 자동 참가 → playing");
  console.log("ALL OK");
} finally {
  // 알림 저장은 비동기(참가 → 호스트 푸시) — 잠깐 기다린 뒤 지우고, 회원 삭제는 FK 가 걸리면 다시 시도한다
  await new Promise((r) => setTimeout(r, 2000));
  await db.execute(sql`delete from hiq_sim_match_shots where match_id in (select id from hiq_sim_matches where host_id in (${host}, ${guest}, ${friend}) or guest_id in (${host}, ${guest}, ${friend}))`);
  await db.execute(sql`delete from hiq_sim_matches where host_id in (${host}, ${guest}, ${friend}) or guest_id in (${host}, ${guest}, ${friend})`);
  for (const id of ids) {
    await db.execute(sql`delete from hiq_sim_ratings where member_id=${id}`);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await db.execute(sql`delete from hiq_notifications where member_id=${id}`);
        await db.execute(sql`delete from hiq_members where id=${id}`);
        break;
      } catch (e) {
        if (attempt === 4) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  const left = (await db.execute(sql`select count(*)::int as n from hiq_members where id in (${host}, ${guest}, ${friend})`)).rows[0] as { n: number };
  console.log("cleanup members left:", left.n);
}
process.exit(0);
