/**
 * 라운드 브리핑을 밖으로 — 단톡방 공유 카드와 전날 저녁 알림(2026-10-05 오너 "응": 라운드 브리핑 7번).
 *
 * 처음 제안한 말: "라운드 전에 날씨 캡처를 돌리는 습관을 랭큐 카드로 받아 오고, 확정된 라운드가 있으면 전날 저녁에 브리핑을 보냅니다."
 *   · 공유 = 카드 그림(/og/golf-round/…png — server/services/golfRoundCard.ts) + 글 몇 줄 + 그 라운드로 바로 여는 주소(?d=&t=).
 *     주소를 단톡방에 붙이면 미리보기에도 같은 카드가 뜬다(검색엔진용 화면이 og:image 를 그 카드로 바꾼다).
 *   · 전날 알림 = 내일 치는 사람에게 저녁 7~8시대에 한 번(server/services/golfRoundEve.ts — 매시 리마인더 크론에 얹었다).
 * 글·주소·시간 창은 여기 한 곳에서 만든다 — 화면·카드·알림·검색엔진용 화면이 같은 말을 쓴다.
 * 날씨는 늘 받아 둔 예보에서만 읽는다(공유·알림 때문에 기상청을 부르지 않는다).
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
import { coursePath } from "./golfCourse.js";
import { gearEmoji } from "./golfPack.js";
import { TEE_HOUR_MAX, TEE_HOUR_MIN, briefReason, lastTee18, type RoundBrief } from "./golfRoundBrief.js";
import { addDays, kstParts, ymdToKey } from "./golfWeather.js";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const KST = 9 * 3600_000;
const pad = (n: number) => String(n).padStart(2, "0");

// ── 주소에 싣는 라운드(?d=20261006&t=7) ───────────────────────────
export interface RoundRef { ymd: string; hour: number }
/** 주소의 d·t → 라운드. 날짜가 달력에 없거나 티오프 시각이 범위 밖이면 null(지어내지 않는다) */
export function parseRoundRef(d: unknown, t: unknown): RoundRef | null {
    if (typeof d !== "string" || !/^\d{8}$/.test(d) || typeof t !== "string" || !/^\d{1,2}$/.test(t)) return null;
    const y = +d.slice(0, 4), m = +d.slice(4, 6), day = +d.slice(6, 8), hour = +t;
    const dt = new Date(Date.UTC(y, m - 1, day));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) return null;
    if (hour < TEE_HOUR_MIN || hour > TEE_HOUR_MAX) return null;
    return { ymd: d, hour };
}
export const roundQuery = (r: RoundRef) => `d=${r.ymd}&t=${r.hour}`;
/** 그 라운드로 바로 여는 골프장 주소 */
export const roundDeepPath = (slug: string, r: RoundRef) => `${coursePath(slug)}?${roundQuery(r)}`;
/** 카드 그림 주소 — 정사각형 PNG */
export const roundCardPath = (slug: string, r: RoundRef) => `/og/golf-round/${encodeURIComponent(slug)}.png?${roundQuery(r)}`;
/** "10월 6일(화)" */
export function roundDateLabel(ymd: string): string {
    const y = +ymd.slice(0, 4), m = +ymd.slice(4, 6), d = +ymd.slice(6, 8);
    return `${m}월 ${d}일(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

// ── 단톡방에 붙는 글 ──────────────────────────────────────────────
/**
 * 카드와 같이 나가는 글 — 카드를 못 붙이는 곳(글만 받는 앱)에서도 이것만으로 뜻이 통하게.
 * teeLabel 은 "07시" 또는 내 티타임의 "07:12".
 */
export function roundShareText(o: { name: string; ymd: string; teeLabel: string; brief: RoundBrief; sunset?: string | null; url: string }): string {
    const lines = [
        `⛳ ${o.name} · ${roundDateLabel(o.ymd)} ${o.teeLabel} 티오프`,
        `${o.brief.verdict} — ${briefReason(o.brief)}`,
    ];
    if (o.brief.gear.length) lines.push(`챙길 것: ${o.brief.gear.map((g) => `${gearEmoji(g)} ${g}`.trim()).join(" · ")}`);
    if (o.sunset) lines.push(`해 짐 ${o.sunset} · 18홀은 ${lastTee18(o.sunset)} 전에 티오프`);
    lines.push(o.url);
    return lines.join("\n");
}
export const roundShareTitle = (name: string) => `${name} 라운드 브리핑`;

// ── 전날 저녁 알림 ────────────────────────────────────────────────
/** 보내는 시간(한국 시각) — 저녁 7시부터 9시 전까지. 9시부터는 조용한 시간이다(관심 알림과 같은 선) */
export const EVE_FROM_HOUR = 19, EVE_UNTIL_HOUR = 21;
/**
 * 지금이 보낼 때인가, 그리고 '내일'이 언제인가. from·to 는 golf_bookings.datetime(시간대 없는 UTC)과 맞댈 글자다 —
 * raw sql 에 Date 를 넘기면 9시간이 어긋나는 함정이 있어 "YYYY-MM-DD HH:MM:SS" 로 만든다.
 */
export function eveWindow(nowMs: number): { due: boolean; ymd: string; fromUtc: string; toUtc: string } {
    const k = kstParts(nowMs);
    const ymd = addDays(k.ymd, 1);
    const startMs = Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) - KST; // 내일 0시(한국) = 전날 15시(UTC)
    const fmt = (ms: number) => { const x = new Date(ms); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}:00`; };
    return { due: k.h >= EVE_FROM_HOUR && k.h < EVE_UNTIL_HOUR, ymd, fromUtc: fmt(startMs), toUtc: fmt(startMs + 86_400_000) };
}
/** 같은 글에 같은 사람에게 한 번만 — 알림함의 이 열쇠로 본다 */
export const eveKey = (listingId: string) => `golf-eve:${listingId}`;

/**
 * 알림 제목·본문. 날씨를 읽었으면 한 줄 평·근거·챙길 것, 못 읽었으면(스크린·골프장 모름·예보 없음) 준비물만 권한다.
 * name 이 없으면(장소를 모르는 글) 이름 없이.
 */
export function eveNotice(o: { name?: string | null; teeMs: number; brief?: RoundBrief | null }): { title: string; body: string } {
    const k = kstParts(o.teeMs);
    const title = `내일 ${pad(k.h)}:${pad(k.min)} ${o.name ? `${o.name} ` : ""}라운드`;
    if (!o.brief) return { title, body: "내일 라운드예요. 준비물을 한 번 챙겨 보세요." };
    const gear = o.brief.gear.length ? ` · 챙길 것 ${o.brief.gear.join("·")}` : "";
    return { title, body: `${o.brief.verdict} · ${briefReason(o.brief)}${gear}` };
}
/** 알림을 누르면 가는 곳 — 골프장을 알면 그 라운드의 날씨, 모르면 내 예약 */
export function eveUrl(slug: string | null | undefined, teeMs: number, snappedHour?: number | null): string {
    if (!slug) return "/golf/my-bookings";
    const k = kstParts(teeMs);
    const hour = Math.min(TEE_HOUR_MAX, Math.max(TEE_HOUR_MIN, snappedHour ?? k.h));
    return roundDeepPath(slug, { ymd: k.ymd, hour });
}
export { ymdToKey };
