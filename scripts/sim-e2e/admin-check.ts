/** 어드민 온라인당구 게임 현황 API 확인 — 오너 프로필의 서명 파트너 쿠키(hiq_partner_auth)로 읽기만. `npx tsx scripts/sim-e2e/admin-check.ts [base]` */
import "dotenv/config";
import { createHmac } from "crypto";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
const OWNER = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const row = (await db.execute(sql`select m.profile_id, p.role from hiq_members m join profiles p on p.id = m.profile_id where m.id = ${OWNER}`)).rows[0] as { profile_id: string; role: string } | undefined;
if (!row) throw new Error("owner profile not found");
console.log("owner profile role:", row.role);
const sig = encodeURIComponent(createHmac("sha256", secret).update(row.profile_id).digest("base64").replace(/=+$/, ""));
const r = await fetch((process.argv[2] ?? "http://localhost:5001") + "/api/hiq/admin/online-game?days=30", { headers: { cookie: `hiq_partner_auth=s%3A${row.profile_id}.${sig}` } });
const j = await r.json();
const d = j.data ?? {};
console.log("status", r.status, "success", j.success, j.message ?? "");
if (d.sessions) console.log(JSON.stringify({ sessions: d.sessions, matches: d.matches, drills: d.drills, active: d.activePlayers, daily: d.daily?.length, byGame: d.byGame, top: d.topPlayers?.length, recent: d.recentMatches?.length }).slice(0, 1200));
process.exit(0);
