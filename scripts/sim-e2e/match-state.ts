/** 오너 계정의 진행 중 대전 상태(읽기만): 차례·turnSeenAt·serverNow·마지막 샷. `npx tsx scripts/sim-e2e/match-state.ts [base]` */
import "dotenv/config";
import { createHmac } from "crypto";
const BASE = process.argv[2] || "https://www.rankue.co.kr";
const id = "02fce921-5170-4c0e-9cc2-5be2906f0bb0";
const secret = process.env.COOKIE_SECRET!;
const sig = encodeURIComponent(createHmac("sha256", secret).update(id).digest("base64").replace(/=+$/, ""));
const cookie = `hiq_user_id=s%3A${id}.${sig}`;
const r = await fetch(`${BASE}/api/hiq/sim/matches`, { headers: { cookie } });
const j = await r.json();
for (const m of (j.data as any[]).filter((m) => m.status === "playing" || m.status === "waiting")) {
  console.log(JSON.stringify({ id: m.id, status: m.status, host: m.hostName, guest: m.guestName, myIndex: m.myIndex, turn: m.turn, shots: m.shots, turnSeenAt: m.turnSeenAt, serverNow: m.serverNow, lastShotAt: m.lastShotAt, startedAt: m.startedAt, createdAt: m.createdAt, aimAssist: m.aimAssist }));
}
console.log("playing/waiting count:", (j.data as any[]).filter((m) => m.status === "playing" || m.status === "waiting").length);
