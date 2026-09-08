/**
 * 온라인게임 오픈 알림 — 회원마다 언어를 정해 그 언어의 제목·내용으로 보낸다(인앱 알림함 + 푸시 토큰이 있으면 기기 알림, 누르면 /online-game).
 * 언어: 회원 country(직접 설정) → 프로필 countryCode(가입 IP) → 전화(010·+82 = ko) → 소셜 가입은 카카오/네이버 = ko, 그 밖엔 en.
 * 실행: `npx tsx scripts/push/online-game-launch.ts` = 대상 집계만(dry run). 실제 발송은 `--send`. 같은 제목의 알림이 이미 있는 회원은 건너뛴다(중복 방지).
 */
import "dotenv/config";
import { db } from "../../server/db";
import { sql } from "drizzle-orm";
import { notificationService } from "../../server/services/notificationService";

type Lang = "ko" | "en" | "es" | "tr" | "vi";
export const COPY: Record<Lang, { title: string; body: string }> = {
  ko: { title: "온라인게임 오픈! 폰으로 치는 3쿠션·4구", body: "랭큐 온라인게임이 열렸어요. 혼자 연습하고, 친구를 초대하거나 멀티방에서 누구와도 대전해 보세요. 3판만 치면 랭킹에 오릅니다. 홈에서 온라인게임을 눌러 시작하세요." },
  en: { title: "Online game is live — 3-cushion & 4-ball on your phone", body: "Rankue's online game is open. Practice solo, invite a friend, or play anyone in the multi rooms. Finish 3 matches to enter the ranking. Tap Online game on the home screen to start." },
  es: { title: "¡Juego en línea disponible! 3 bandas y 4 bolas en tu móvil", body: "Ya está abierto el juego en línea de Rankue. Practica solo, invita a un amigo o juega con cualquiera en las salas. Con 3 partidas entras en el ranking. Toca Juego en línea en la pantalla de inicio." },
  tr: { title: "Çevrimiçi oyun açıldı — telefonda 3 bant ve 4 top", body: "Rankue çevrimiçi oyunu açıldı. Tek başına antrenman yap, arkadaşını davet et ya da odalarda herkesle oyna. 3 maç bitirince sıralamaya girersin. Ana ekranda Çevrimiçi oyun'a dokun." },
  vi: { title: "Trò chơi trực tuyến đã mở — 3 băng & 4 bi trên điện thoại", body: "Trò chơi trực tuyến của Rankue đã mở. Luyện tập một mình, mời bạn bè hoặc đấu với bất kỳ ai trong phòng chơi. Hoàn thành 3 trận để vào bảng xếp hạng. Nhấn Trò chơi trực tuyến ở màn hình chính." },
};
const ES = new Set(["MX", "ES", "CO", "AR", "PE", "CL", "VE", "EC", "GT", "DO", "PA", "UY", "BO", "PY", "HN", "SV", "NI", "CU", "PR", "CR"]);
export function langFor(m: { country: string | null; countryCode: string | null; phone: string }): Lang {
  const cc = (m.country || m.countryCode || "").toUpperCase();
  if (cc === "KR") return "ko";
  if (ES.has(cc)) return "es";
  if (cc === "TR") return "tr";
  if (cc === "VN") return "vi";
  if (cc) return "en";
  const ph = m.phone || "";
  if (/^(\+?82|010)/.test(ph)) return "ko";
  if (/kakao|naver/i.test(ph)) return "ko";
  return "en";
}
for (const [k, v] of Object.entries(COPY)) { if (v.title.length > 60 || v.body.length > 200) throw new Error(`${k} 길이 초과 ${v.title.length}/${v.body.length}`); }

const send = process.argv.includes("--send");
const rows = (await db.execute(sql`
  select m.id, m.name, m.phone, m.country, p.country_code, (p.push_token is not null) as has_token
  from hiq_members m left join profiles p on p.id = m.profile_id
  where m.phone not like '000-e2e-%' and m.phone not like 'del%'`)).rows as { id: string; name: string; phone: string; country: string | null; country_code: string | null; has_token: boolean }[];
const plan = rows.map((r) => ({ ...r, lang: langFor({ country: r.country, countryCode: r.country_code, phone: r.phone }) }));
const byLang: Record<string, { n: number; tokens: number }> = {};
for (const p of plan) { byLang[p.lang] = byLang[p.lang] || { n: 0, tokens: 0 }; byLang[p.lang].n++; if (p.has_token) byLang[p.lang].tokens++; }
console.log("대상", plan.length, "명 / 언어별(명·기기 토큰):", JSON.stringify(byLang));
if (!send) { console.log("dry run — 발송하려면 --send"); process.exit(0); }
let sent = 0, skipped = 0;
for (const p of plan) {
  const copy = COPY[p.lang];
  const dup = (await db.execute(sql`select 1 from hiq_notifications where member_id = ${p.id} and title = ${copy.title} limit 1`)).rows.length > 0;
  if (dup) { skipped++; continue; }
  await notificationService.sendAndSaveNotification({ memberId: p.id, title: copy.title, body: copy.body, category: "admin", type: "broadcast", params: { url: "/online-game" } });
  sent++;
}
console.log("sent", sent, "skipped(dup)", skipped);
process.exit(0);
