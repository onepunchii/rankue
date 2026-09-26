/**
 * 어드민 화면 공용 표시 도우미 — 시각은 전부 한국 시각으로 읽는다(서버·관리자 기기 시간대와 무관).
 */
import { flagEmoji } from "@/lib/flag";

const KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const KST_DATE = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" });

/** "14:05" (한국 시각) */
export function kstTime(iso: string | null | undefined): string {
    if (!iso) return "-";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "-" : KST_TIME.format(d);
}

/** "26. 09. 26." (한국 날짜) */
export function kstDate(iso: string | null | undefined): string {
    if (!iso) return "-";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "-" : KST_DATE.format(d);
}

/** 한국 날짜 열쇠 'YYYY-MM-DD' */
export function kstDayKey(ms: number): string {
    return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 이 시각이 한국 날짜로 오늘인가 */
export function isKstToday(iso: string | null | undefined): boolean {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && kstDayKey(t) === kstDayKey(Date.now());
}

/** 며칠 전인가(없으면 Infinity) */
export function daysSince(iso: string | null | undefined): number {
    if (!iso) return Infinity;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? (Date.now() - t) / 86_400_000 : Infinity;
}

/** 마지막 접속을 "3분 전 · 2일 전" 으로. 기록이 없으면 '-'. */
export function lastSeenLabel(iso: string | null | undefined): string {
    if (!iso) return "-";
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return "-";
    const min = Math.floor(ms / 60_000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    return d < 30 ? `${d}일 전` : `${Math.floor(d / 30)}달 전`;
}

/** 30일 넘게 안 들어온 회원은 이탈로 본다 — 붉게. 7일 안이면 진하게. */
export function lastSeenTone(iso: string | null | undefined): string {
    if (!iso) return "text-black/25";
    const d = daysSince(iso);
    return d > 30 ? "text-red-600" : d <= 7 ? "text-[rgba(0,0,0,0.87)] font-bold" : "text-black/55";
}

/** 소셜 로그인 회원은 phone 이 "social:..." — 전화·문자 대상이 아니다. */
export function isRealPhone(phone: string | null | undefined): boolean {
    return !!phone && !String(phone).startsWith("social:");
}

/** 표시용 전화번호: 소셜 가입이면 "소셜 로그인" */
export function phoneLabel(phone: string | null | undefined): string {
    if (!phone) return "-";
    if (String(phone).startsWith("social:")) return "소셜 로그인";
    return phone;
}

export function PlatformIcon({ platform, className }: { platform: string | null | undefined; className?: string }) {
    if (platform === "ios") return <span className={className} title="iOS(애플)">🍎</span>;
    if (platform === "android") return <span className={className} title="Android(안드로이드)">🤖</span>;
    if (platform === "web") return <span className={className} title="웹 브라우저">🌐</span>;
    return <span className={`text-black/25 ${className ?? ""}`} title="앱 미설치(웹) 또는 알림 미허용">-</span>;
}

export function CountryFlag({ code }: { code: string | null | undefined }) {
    if (!code) return <span className="text-black/25">-</span>;
    return <span title={code}>{flagEmoji(code) || code}</span>;
}

/** 한 칸짜리 숫자 타일 */
export function KpiTile({ label, value, unit, sub, tone = "default", onClick }: {
    label: string; value: number | string; unit?: string; sub?: React.ReactNode;
    tone?: "default" | "brand" | "alert"; onClick?: () => void;
}) {
    const box = tone === "brand" ? "bg-brand/[0.06] border-brand/25" : tone === "alert" ? "bg-red-500/[0.05] border-red-500/25" : "bg-white border-black/[0.08]";
    const Comp = onClick ? "button" : "div";
    return (
        <Comp onClick={onClick} className={`rounded-2xl border p-4 text-left ${box} ${onClick ? "active:scale-[0.99] transition-transform hover:border-brand/40" : ""}`}>
            <p className="text-[12px] font-bold text-black/50">{label}</p>
            <p className={`mt-1 text-[24px] leading-none font-black tabular-nums ${tone === "alert" ? "text-red-600" : tone === "brand" ? "text-brand" : "text-[rgba(0,0,0,0.87)]"}`}>
                {value}{unit && <span className="ml-0.5 text-[12px] font-bold text-black/40">{unit}</span>}
            </p>
            {sub && <div className="mt-1.5 text-[11.5px] text-black/45 tabular-nums">{sub}</div>}
        </Comp>
    );
}
