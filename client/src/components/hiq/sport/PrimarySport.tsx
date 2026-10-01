/**
 * 주 종목 고르기(2026-10-01 오너: "회원가입 때 당구·골프 예쁜 버튼으로 고르면 그 종목이 주 입장 통로 — 지금은 골프 사람도 당구로 들어온다").
 *
 *  - SportChoiceCards: 당구 | 골프 큰 카드 두 장. 종목마다 고정색(당구 초록·골프 라임 — 설정 알림 탭과 같은 색)과 작은 그림.
 *  - PrimarySportGate: 아직 안 고른 회원(primary_sport null)에게 **한 번** 전체 화면으로 묻는다 — 가입 직후 첫 화면이자,
 *    기존 회원은 다음 접속 때 한 번. 처음 선택은 서버가 기록으로 추정한 값(suggestedSport: 골프 라운드·조인 흔적 → 골프).
 *    고르면 회원 정보에 남고(폰을 바꿔도 그 종목으로 시작) 지금 화면도 그 종목으로 바뀐다.
 *  - 골프를 쓸 수 없는 회원(한국어가 아닌 앱)·로그인·가입·콘솔 화면에서는 묻지 않는다.
 * 테마와 무관한 밝은 고정 디자인(리터럴 색) — 골프 화면 위에 떠도 같은 모습이다.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { useSport } from "@/contexts/SportContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PrimarySport } from "@shared/primarySport";

export const SPORT_ACCENT: Record<PrimarySport, { color: string; tint: string; fg: string }> = {
    BILLIARDS: { color: "#12805C", tint: "#12805C14", fg: "#ffffff" },
    GOLF: { color: "#5CC417", tint: "#5CC4171A", fg: "#0B1A03" },
};

/** 당구 — 캐롬 공 세 개(흰·노랑·빨강) */
function BilliardsArt() {
    return (
        <svg viewBox="0 0 64 64" className="w-14 h-14" aria-hidden>
            <rect x="2" y="10" width="60" height="44" rx="10" fill="#12805C" />
            <rect x="7" y="15" width="50" height="34" rx="6" fill="#169468" />
            <circle cx="24" cy="36" r="7" fill="#F4F2EC" />
            <circle cx="38" cy="28" r="7" fill="#F4C542" />
            <circle cx="44" cy="40" r="7" fill="#E24B4A" />
            <circle cx="22" cy="34" r="2" fill="#ffffff" opacity="0.7" />
        </svg>
    );
}

/** 골프 — 그린 위 깃발과 공 */
function GolfArt() {
    return (
        <svg viewBox="0 0 64 64" className="w-14 h-14" aria-hidden>
            <ellipse cx="32" cy="50" rx="28" ry="10" fill="#5CC417" />
            <ellipse cx="34" cy="50" rx="5" ry="2" fill="#2E5E0C" />
            <rect x="33" y="12" width="2.5" height="38" rx="1.2" fill="#3A3A3A" />
            <path d="M35.5 13 L52 19 L35.5 25 Z" fill="#FF8A3D" />
            <circle cx="20" cy="46" r="4.5" fill="#ffffff" stroke="#D9D9D9" strokeWidth="1" />
        </svg>
    );
}

export function SportChoiceCards({ value, onChange }: { value: PrimarySport | null; onChange: (s: PrimarySport) => void }) {
    const { t } = useT();
    const cards: { id: PrimarySport; title: string; sub: string; Art: () => JSX.Element }[] = [
        { id: "BILLIARDS", title: t("primarySport.billiards"), sub: t("primarySport.billiardsSub"), Art: BilliardsArt },
        { id: "GOLF", title: t("primarySport.golf"), sub: t("primarySport.golfSub"), Art: GolfArt },
    ];
    return (
        <div role="radiogroup" aria-label={t("primarySport.title")} className="grid grid-cols-2 gap-3">
            {cards.map(({ id, title, sub, Art }) => {
                const on = value === id;
                const a = SPORT_ACCENT[id];
                return (
                    <button
                        key={id} type="button" role="radio" aria-checked={on} onClick={() => onChange(id)}
                        className="relative rounded-[20px] p-4 pt-5 text-left transition-all active:scale-[0.98] bg-[#ffffff]"
                        style={{ border: `2px solid ${on ? a.color : "#E6E6E3"}`, backgroundColor: on ? a.tint : "#ffffff", boxShadow: on ? `0 8px 24px ${a.color}29` : "none" }}
                    >
                        <Art />
                        <span className="block mt-3 text-[18px] font-bold text-[#111111]">{title}</span>
                        <span className="block mt-1 text-[12.5px] leading-snug text-[#6B6B6B] break-keep">{sub}</span>
                        <span
                            aria-hidden
                            className={cn("absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-opacity", on ? "opacity-100" : "opacity-0")}
                            style={{ backgroundColor: a.color }}
                        >
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M3.5 8.5 L6.5 11.5 L12.5 5" fill="none" stroke={a.fg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** 주 종목 저장 — 서버(회원 정보)·지금 화면 종목·캐시를 한 번에 */
export function useSavePrimarySport() {
    const qc = useQueryClient();
    const { setSport } = useSport();
    return async (sport: PrimarySport) => {
        await apiRequest("/api/hiq/me/primary-sport", { method: "POST", body: { sport } });
        setSport(sport);
        try { sessionStorage.setItem("rankue_primary_sport_applied", "1"); } catch { /* 저장소를 못 쓰는 환경 */ }
        qc.setQueryData(["/api/hiq/me"], (old: any) => (old ? { ...old, primarySport: sport, suggestedSport: null } : old));
    };
}

const HIDDEN_PATHS = /^\/(admin|partner|register)(\/|$|\?)/;

export function PrimarySportGate() {
    const { member } = useAuth();
    const { t, locale } = useT();
    const [location] = useLocation();
    const { toast } = useToast();
    const save = useSavePrimarySport();
    const m = member as (typeof member & { primarySport?: string | null; suggestedSport?: string | null; golfAccess?: boolean }) | undefined;
    const suggested: PrimarySport = m?.suggestedSport === "GOLF" ? "GOLF" : "BILLIARDS";
    const [choice, setChoice] = useState<PrimarySport | null>(null);
    const [busy, setBusy] = useState(false);

    const need = !!m && !m.primarySport && m.golfAccess === true && locale === "ko"
        && !HIDDEN_PATHS.test(location) && location !== "/" && location !== "/hiq";
    if (!need) return null;
    const picked = choice ?? suggested;
    const a = SPORT_ACCENT[picked];

    const start = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await save(picked);
        } catch {
            toast({ title: t("primarySport.saveFailed"), variant: "destructive" });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="primary-sport-title" className="fixed inset-0 z-[950] bg-[#F7F7F5] overflow-y-auto">
            <div className="min-h-full max-w-md mx-auto px-5 flex flex-col" style={{ paddingTop: "calc(env(safe-area-inset-top) + 48px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
                <p className="text-[13px] font-bold tracking-[0.18em] text-[#9A9A9A]">RANKUE</p>
                <h1 id="primary-sport-title" className="mt-3 text-[26px] leading-tight font-bold text-[#111111] break-keep">{t("primarySport.title")}</h1>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[#6B6B6B] break-keep">{t("primarySport.desc")}</p>
                <div className="mt-8">
                    <SportChoiceCards value={picked} onChange={setChoice} />
                </div>
                <p className="mt-4 text-[12.5px] text-[#8A8A8A] break-keep">{t("primarySport.note")}</p>
                <div className="flex-1 min-h-8" />
                <button
                    type="button" onClick={() => void start()} disabled={busy}
                    className="w-full h-14 rounded-2xl text-[16px] font-bold transition-opacity disabled:opacity-60 active:scale-[0.99]"
                    style={{ backgroundColor: a.color, color: a.fg }}
                >
                    {t(picked === "GOLF" ? "primarySport.startGolf" : "primarySport.startBilliards")}
                </button>
            </div>
        </div>
    );
}
