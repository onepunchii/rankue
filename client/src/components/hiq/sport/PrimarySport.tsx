/**
 * 주 종목 고르기(2026-10-01 오너: "회원가입 때 당구·골프 예쁜 버튼으로 고르면 그 종목이 주 입장 통로 — 지금은 골프 사람도 당구로 들어온다").
 *
 *  - PrimarySportGate: 아직 안 고른 회원(primary_sport null)에게 **한 번** 묻는 가운데 팝업 — 가입 직후 첫 화면이자,
 *    기존 회원은 다음 접속 때 한 번. 처음 선택은 서버가 기록으로 추정한 값(suggestedSport: 골프 라운드·조인 흔적 → 골프).
 *    고르면 회원 정보에 남고(폰을 바꿔도 그 종목으로 시작) 지금 화면도 그 종목으로 바뀐다.
 *    같은 날 오너 피드백: "전체 화면보다 팝업 느낌으로, 가운데에서 깔끔하게" → 어두운 막 위 흰 카드, 두 칸 타일 + 시작 단추.
 *  - SportSegment: 설정의 '주 종목' — 당구 | 골프 두 칸 스위치. 큰 카드는 골프(어두운) 테마에서 흰 판·어두운 글자가
 *    튀어서(오너 스크린샷), 설정에서는 테마 토큰을 따르는 두 칸으로 바꿨다. 고른 칸만 종목 색.
 *  - 골프를 쓸 수 없는 회원(한국어가 아닌 앱)·로그인·가입·콘솔 화면에서는 묻지 않는다.
 * 종목 색은 설정 알림 탭과 같다(당구 초록·골프 라임).
 */
import { useAttachPhonePending } from "@/components/hiq/AttachPhoneSheet";
import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { useSport } from "@/contexts/SportContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { PrimarySport } from "@shared/primarySport";

export const SPORT_ACCENT: Record<PrimarySport, { color: string; tint: string; fg: string }> = {
    BILLIARDS: { color: "#12805C", tint: "#12805C12", fg: "#ffffff" },
    GOLF: { color: "#4FB512", tint: "#5CC41718", fg: "#ffffff" },
};

/** 당구 — 캐롬 공 세 개(흰·노랑·빨강) */
function BilliardsArt({ size = 44 }: { size?: number }) {
    return (
        <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
            <circle cx="17" cy="29" r="9" fill="#F4F2EC" stroke="#E1DED6" strokeWidth="1" />
            <circle cx="31" cy="20" r="9" fill="#F4C542" />
            <circle cx="33" cy="34" r="9" fill="#E24B4A" />
            <circle cx="14" cy="26" r="2.4" fill="#ffffff" />
            <circle cx="28" cy="17" r="2.4" fill="#FFE59A" />
            <circle cx="30" cy="31" r="2.4" fill="#F28B8A" />
        </svg>
    );
}

/** 골프 — 그린 위 깃발과 공 */
function GolfArt({ size = 44 }: { size?: number }) {
    return (
        <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
            <ellipse cx="24" cy="38" rx="19" ry="6.5" fill="#6BCB2A" />
            <ellipse cx="26" cy="38" rx="3.6" ry="1.4" fill="#2E5E0C" />
            <rect x="25" y="8" width="2.2" height="30" rx="1.1" fill="#3A3A3A" />
            <path d="M27.2 9 L39 13.5 L27.2 18 Z" fill="#FF8A3D" />
            <circle cx="14" cy="35" r="3.6" fill="#ffffff" stroke="#D9D9D9" strokeWidth="0.8" />
        </svg>
    );
}

const ART: Record<PrimarySport, (p: { size?: number }) => JSX.Element> = { BILLIARDS: BilliardsArt, GOLF: GolfArt };

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

/** 팝업 안의 두 칸 타일 — 늘 밝은 카드 위(리터럴 색) */
function SportTiles({ value, onChange }: { value: PrimarySport; onChange: (s: PrimarySport) => void }) {
    const { t } = useT();
    const items: { id: PrimarySport; title: string; sub: string }[] = [
        { id: "BILLIARDS", title: t("primarySport.billiards"), sub: t("primarySport.billiardsSub") },
        { id: "GOLF", title: t("primarySport.golf"), sub: t("primarySport.golfSub") },
    ];
    return (
        <div role="radiogroup" aria-label={t("primarySport.title")} className="grid grid-cols-2 gap-2.5">
            {items.map(({ id, title, sub }) => {
                const on = value === id;
                const a = SPORT_ACCENT[id];
                const Art = ART[id];
                return (
                    <button
                        key={id} type="button" role="radio" aria-checked={on} onClick={() => onChange(id)}
                        className="relative flex flex-col items-center text-center rounded-[20px] px-3 pt-5 pb-4 transition-all active:scale-[0.98]"
                        style={{
                            border: `2px solid ${on ? a.color : "#EDEDEA"}`,
                            backgroundColor: on ? a.tint : "#FAFAF8",
                        }}
                    >
                        <span className="w-[60px] h-[60px] rounded-full flex items-center justify-center" style={{ backgroundColor: on ? "#ffffff" : "#F1F1EE" }}>
                            <Art size={42} />
                        </span>
                        <span className="mt-3 text-[16px] font-bold" style={{ color: on ? a.color : "#1A1A1A" }}>{title}</span>
                        <span className="mt-1 text-[11.5px] leading-snug text-[#8A8A86] break-keep">{sub}</span>
                        <span
                            aria-hidden
                            className={cn("absolute top-2.5 right-2.5 w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all", on ? "opacity-100 scale-100" : "opacity-0 scale-75")}
                            style={{ backgroundColor: a.color }}
                        >
                            <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M3.5 8.5 L6.5 11.5 L12.5 5" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** 설정용 — 당구 | 골프 두 칸 스위치. 바탕·글자는 테마 토큰(당구 밝음·골프 어두움), 고른 칸만 종목 색 */
export function SportSegment({ value, onChange, disabled }: { value: PrimarySport | null; onChange: (s: PrimarySport) => void; disabled?: boolean }) {
    const { t } = useT();
    return (
        <div role="radiogroup" aria-label={t("primarySport.settingsTitle")} className="grid grid-cols-2 gap-1 p-1 rounded-tile bg-black/[0.05]">
            {(["BILLIARDS", "GOLF"] as const).map((id) => {
                const on = value === id;
                const a = SPORT_ACCENT[id];
                const Art = ART[id];
                return (
                    <button
                        key={id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(id)}
                        className={cn(
                            "h-12 rounded-[10px] flex items-center justify-center gap-2 text-[14.5px] font-semibold transition-colors disabled:opacity-60",
                            !on && "text-black/55",
                        )}
                        style={on ? { backgroundColor: a.color, color: a.fg } : undefined}
                    >
                        <Art size={22} />
                        {t(id === "GOLF" ? "primarySport.golf" : "primarySport.billiards")}
                    </button>
                );
            })}
        </div>
    );
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
    // "전에 전화번호로 쓰셨나요?"(AttachPhoneSheet)가 먼저다 — 이으면 계정이 바뀌어, 빈 새 계정에 주 종목을 물을 이유가 없다
    const attachPending = useAttachPhonePending();

    const need = !!m && !m.primarySport && m.golfAccess === true && locale === "ko" && !attachPending
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
        <div role="dialog" aria-modal="true" aria-labelledby="primary-sport-title" className="fixed inset-0 z-[950] flex items-center justify-center px-5 bg-black/55">
            <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="w-full max-w-[360px] rounded-[28px] bg-[#ffffff] px-5 pt-7 pb-5 shadow-[0_24px_64px_rgba(0,0,0,0.35)]"
            >
                <p className="text-center text-[11px] font-bold tracking-[0.22em] text-[#B0B0AC]">RANKUE</p>
                <h1 id="primary-sport-title" className="mt-2 text-center text-[21px] leading-snug font-bold text-[#141414] break-keep">{t("primarySport.title")}</h1>
                <p className="mt-1.5 text-center text-[13px] leading-relaxed text-[#7A7A76] break-keep">{t("primarySport.desc")}</p>
                <div className="mt-5">
                    <SportTiles value={picked} onChange={setChoice} />
                </div>
                <button
                    type="button" onClick={() => void start()} disabled={busy}
                    className="mt-5 w-full h-[52px] rounded-2xl text-[15.5px] font-bold transition-opacity disabled:opacity-60 active:scale-[0.99]"
                    style={{ backgroundColor: a.color, color: a.fg }}
                >
                    {t(picked === "GOLF" ? "primarySport.startGolf" : "primarySport.startBilliards")}
                </button>
                <p className="mt-3 text-center text-[11.5px] text-[#A0A09C] break-keep">{t("primarySport.note")}</p>
            </motion.div>
        </div>
    );
}
