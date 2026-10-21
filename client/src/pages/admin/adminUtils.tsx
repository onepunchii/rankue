/**
 * 어드민 화면 공용 표시 도우미 — 시각은 전부 한국 시각으로 읽는다(서버·관리자 기기 시간대와 무관).
 */
import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { flagEmoji } from "@/lib/flag";
import { LucideExternalLink, LucideX } from "@/lib/icons";

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

/**
 * 회원 얼굴 — 프로필 사진이 있으면 사진, 없거나 안 열리면 이름 첫 글자.
 * 사진은 직접 올린 것이거나, 올리기 전까지 쓰는 카카오·구글 계정의 사진이다(server/lib/providerAvatar.ts).
 * 글자를 밑에 깔고 사진을 그 위에 얹는다 — 사진이 깨지면 사진만 치워서 글자가 그대로 보인다.
 * zoom(2026-10-21 오너: "어드민에 회원에 프로필 사진 누르면 크게 볼 수 있게") — 사진이 있을 때만 단추가 되어 크게 보기를 연다.
 *   줄 전체가 회원 상세를 여는 단추 · 행이라, 누름이 그쪽으로 새지 않게 막는다(포털 안의 누름도 React 에선 부모로 올라간다).
 *   단추 안에 단추를 넣지 말 것 — 폰 목록은 사진을 줄 단추 밖에 둔다(MembersView).
 */
export function MemberAvatar({ name, src, className = "", zoom = false }: { name: string | null | undefined; src: string | null | undefined; className?: string; zoom?: boolean }) {
    const [broken, setBroken] = useState(false);
    const [open, setOpen] = useState(false);
    const face = (
        <span className={`relative shrink-0 rounded-full overflow-hidden flex items-center justify-center ${className}`}>
            {name?.slice(0, 1) || "?"}
            {src && !broken && (
                <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setBroken(true)}
                />
            )}
        </span>
    );
    if (!zoom || !src || broken) return face;
    // 누름만 막는다 — keydown · pointerdown 까지 막으면 Radix 가 document 에서 듣는 Esc · 바깥 누름이 끊긴다
    return (
        <span className="shrink-0 inline-flex" onClick={(e) => e.stopPropagation()}>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`${name ?? "회원"} 프로필 사진 크게 보기`}
                data-testid="member-avatar-zoom"
                className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-95 transition-transform cursor-zoom-in"
            >
                {face}
            </button>
            <MemberPhotoZoom open={open} onOpenChange={setOpen} name={name} src={src} />
        </span>
    );
}

/** 사진이 어디서 왔나 — 직접 올린 것(hiq/avatar/) · 카카오·구글 계정에서 가져온 사본(hiq/profile/) */
export function memberPhotoSource(src: string): string | null {
    if (/\/hiq\/avatar\//.test(src)) return "직접 올린 사진";
    if (/\/hiq\/profile\//.test(src)) return "카카오 · 구글 계정 사진";
    return null;
}

/**
 * 회원 사진 크게 보기 — 검은 바탕에 사진 한 장(자르지 않는다), 밑에 이름 · 어디서 온 사진인지 · 원본 열기.
 * Radix Dialog 라 회원 상세 시트 위에 겹쳐 열리고, 관리자 콘솔의 '뒤로'(adminBack.closeTopLayer)가 이것부터 닫는다.
 */
export function MemberPhotoZoom({ open, onOpenChange, name, src }: { open: boolean; onOpenChange: (v: boolean) => void; name: string | null | undefined; src: string }) {
    const from = memberPhotoSource(src);
    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[#0A0A0B]/95 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    onClick={() => onOpenChange(false)}
                    className="fixed inset-0 z-[61] flex flex-col items-center justify-center px-4 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
                    style={{ paddingTop: "calc(env(safe-area-inset-top) + 56px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
                    data-testid="member-photo-zoom"
                >
                    <DialogPrimitive.Title className="sr-only">{`${name ?? "회원"} 프로필 사진`}</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="sr-only">사진 밖을 누르면 닫혀요</DialogPrimitive.Description>
                    <DialogPrimitive.Close
                        aria-label="닫기"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white active:bg-white/20"
                        style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
                    >
                        <LucideX className="h-6 w-6" />
                    </DialogPrimitive.Close>
                    <img
                        src={src}
                        alt={`${name ?? "회원"} 프로필 사진`}
                        referrerPolicy="no-referrer"
                        onClick={(e) => e.stopPropagation()}
                        className="max-h-[calc(100dvh-220px)] max-w-[min(92vw,640px)] rounded-2xl object-contain bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
                    />
                    <div className="mt-4 flex flex-col items-center gap-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[16px] font-bold text-white">{name ?? "이름 없음"}</span>
                        <span className="flex items-center gap-2 text-[13px] text-white/60">
                            {from && <span>{from}</span>}
                            {from && <span aria-hidden>·</span>}
                            <a href={src} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-white/80 underline-offset-2 hover:underline">
                                원본 열기 <LucideExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </span>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
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

// --- 화면 공용 조각(2026-09-26 어드민 전체 정리) — 모든 탭이 같은 모양의 거르기·검색·빈 화면을 쓴다 ---

/** 가로로 밀리는 거르기 칩. count 가 있으면 옆에 숫자. */
export function FilterChips<T extends string>({ value, onChange, options }: {
    value: T; onChange: (v: T) => void;
    options: { id: T; label: string; count?: number; alert?: boolean }[];
}) {
    return (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
            {options.map((o) => {
                const on = value === o.id;
                return (
                    <button key={o.id} onClick={() => onChange(o.id)}
                        className={`shrink-0 h-8 px-3 rounded-full text-[12.5px] font-bold tabular-nums transition-colors ${on ? "bg-brand text-white" : "bg-white border border-black/[0.08] text-black/60 hover:text-black/80"}`}>
                        {o.label}
                        {o.count !== undefined && (
                            <span className={`ml-1 ${on ? "text-white/80" : o.alert && o.count > 0 ? "text-red-600" : "text-black/35"}`}>{o.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export function SearchBox({ value, onChange, placeholder, className = "" }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
    return (
        <div className={`relative ${className}`}>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-black/10 text-sm outline-none focus:border-brand/40" />
        </div>
    );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
    return <div className="rounded-2xl bg-white border border-black/[0.07] p-10 text-center text-[13.5px] text-black/45 leading-relaxed">{children}</div>;
}

/** 흰 카드 */
export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-white rounded-2xl border border-black/[0.07] ${className}`}>{children}</div>;
}

/** 작은 상태 알약 */
export function Pill({ tone = "neutral", children }: { tone?: "brand" | "alert" | "warn" | "neutral" | "info"; children: React.ReactNode }) {
    const cls = {
        brand: "bg-brand/10 text-brand",
        alert: "bg-red-500/10 text-red-600",
        warn: "bg-amber-500/15 text-amber-800",
        neutral: "bg-black/[0.05] text-black/55",
        info: "bg-blue-500/10 text-blue-700",
    }[tone];
    return <span className={`inline-flex items-center shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${cls}`}>{children}</span>;
}

/** 전화·문자 링크 버튼(진짜 번호일 때만) */
export function CallButton({ phone, label = "전화" }: { phone: string | null | undefined; label?: string }) {
    if (!isRealPhone(phone)) return null;
    return (
        <a href={`tel:${phone}`} className="h-9 px-3 rounded-lg border border-black/10 inline-flex items-center justify-center text-[13px] font-bold text-black/65 hover:border-brand/40 hover:text-brand">
            {label}
        </a>
    );
}

/** "3시간 전"(방금·분·시간·일) */
export function agoLabel(iso: string | null | undefined): string {
    return lastSeenLabel(iso);
}

/** 한국 시각 "9/26 14:05" */
export function kstDateTime(iso: string | null | undefined): string {
    if (!iso) return "-";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

// --- 아이폰 앱의 상태바(2026-10-08 오너: "어드민도 애플일 때 헤더 쪽이랑 사이즈가 안 맞고") ---
// 앱은 웹 화면이 상태바 밑까지 깔린다(capacitor contentInset: never). 웹·안드로이드에서는 env(safe-area-inset-top) 이 0 이라 아래 값들이 예전과 같다.

/**
 * 폰 머리줄(56px) 바로 밑에 붙는 거르기 줄의 자리 — 머리줄이 상태바만큼 길어지므로 그만큼 더 내린다. 넓은 화면은 맨 위(md:top-0).
 * 예전의 `sticky top-14` 는 아이폰 앱에서 머리줄에 가려졌다.
 */
export const ADMIN_STICKY_TOP = "sticky top-[calc(3.5rem+env(safe-area-inset-top))] md:top-0";

/**
 * 옆에서 나오는 전체 높이 시트(SheetContent side="right"·"left")의 윗여백 — 안 주면 시트의 머리가 상태바·다이내믹 아일랜드 밑으로 들어간다.
 * className 의 p-0 이 지우지 못하게 style 로 준다. 닫기(X) 단추의 자리는 ui/sheet 가 같은 만큼 내린다.
 */
export const SHEET_SAFE_TOP = { paddingTop: "env(safe-area-inset-top)" } as const;

/**
 * 주 종목의 표시(2026-10-13 오너: "어드민 회원에 어떤 카테고리로 설정했는지 표기만 해줘 보기 편하게") — 가입 뒤 '어떤 운동을 주로 하세요?'에서 고른 값.
 * 색은 앱의 종목 색 그대로(당구 녹색 · 골프 주황 · 등산 살구). 아직 안 고른 회원에게는 붙이지 않는다.
 */
export const SPORT_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
    BILLIARDS: { label: "당구", bg: "#0062411F", fg: "#006241" },
    GOLF: { label: "골프", bg: "#FF6B0024", fg: "#C24E00" },
    HIKING: { label: "등산", bg: "#F28C6A33", fg: "#A34E2E" },
};
export function SportChip({ sport }: { sport?: string | null }) {
    const c = sport ? SPORT_CHIP[sport] : undefined;
    if (!c) return null;
    return <span className="shrink-0 rounded-full px-1.5 text-[10.5px] font-bold" style={{ background: c.bg, color: c.fg }} title="주 종목" data-testid="member-sport">{c.label}</span>;
}
