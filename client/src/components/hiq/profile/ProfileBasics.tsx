/**
 * 프로필 기본 두 가지 — 성별 · 나이대(2026-10-20 오너: "당구 골프 등산 낚시에 공통으로 해야 되니깐 성별이랑 나이대로 가고
 * 각 프로필 배너 창 잘 만들어 줘 … 지금 당구에 미프로필 시 나오는 배너 디자인이 별로고 각 카테고리에 알맞게").
 *
 *  - ProfileNudge: 종목 홈의 배너. 두 가지 중 하나라도 비었을 때만, 회원에게만. 종목마다 그 홈의 색 · 그림(당구대 공 · 깃발 · 능선 · 찌).
 *    누르면 창이 열린다. ✕ 는 이 기기에서 일주일 안 보기(localStorage — 못 읽으면 그냥 보인다).
 *  - ProfileBasicsHost + openProfileBasics(sport): 가운데 창(주 종목 창과 같은 모양 — 오너가 고른 '가운데에서 깔끔하게').
 *    왜 묻는지 한 줄(그 종목에서 실제로 쓰는 곳만 — shared/profileBasics 머리말) · 성별 두 칸 · 나이대 여섯 칸 · 저장 · 나중에.
 *  - 저장은 PATCH /me { gender, ageBand } — 설정 화면과 같은 길. 끝나면 '나'를 다시 받는다.
 *
 * 문구는 다섯 언어(t) — 골프 · 등산 · 낚시는 한국어 화면이지만 같은 열쇠를 쓴다.
 */
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useT } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
    AGE_BANDS, PROFILE_NUDGE_SNOOZE_DAYS, PROFILE_NUDGE_SNOOZE_KEY, ageBandOf, isGender, needsProfileBasics,
    type AgeBand, type Gender,
} from "@shared/profileBasics";

export type ProfileSport = "BILLIARDS" | "GOLF" | "HIKING" | "FISHING";

/** 한국 시각의 해 — 출생연도로 나이대를 읽을 때 */
const kstYear = () => new Date(Date.now() + 9 * 3600_000).getUTCFullYear();

/* ── 종목별 색 — 그 홈의 색을 그대로(당구 크림+초록 · 골프 검정+연두 · 등산 밤 능선+산호 · 낚시 새벽 바다+동틀 빛) ── */
interface Tone {
    /** 창 */
    card: string; ink: string; sub: string; faint: string; accent: string; onAccent: string; chip: string; chipLine: string; chipInk: string;
    /** 홈 배너 */
    bannerBg: string; bannerRing: string; bannerInk: string; bannerSub: string; cta: string; onCta: string; x: string;
}
const TONE: Record<ProfileSport, Tone> = {
    BILLIARDS: {
        card: "#FFFFFF", ink: "#141414", sub: "#5F5F5B", faint: "#8E8E8A", accent: "#006241", onAccent: "#FFFFFF", chip: "#FFFFFF", chipLine: "#E4E2DC", chipInk: "#3A3A38",
        bannerBg: "#FFFFFF", bannerRing: "#00624126", bannerInk: "#141414", bannerSub: "#00000094", cta: "#006241", onCta: "#FFFFFF", x: "#00000059",
    },
    GOLF: {
        card: "#161616", ink: "#FFFFFF", sub: "#FFFFFFA6", faint: "#FFFFFF73", accent: "#64DD17", onAccent: "#051907", chip: "#1E1E1E", chipLine: "#FFFFFF1F", chipInk: "#FFFFFFD9",
        bannerBg: "#141414", bannerRing: "#64DD1747", bannerInk: "#FFFFFF", bannerSub: "#FFFFFF99", cta: "#64DD17", onCta: "#051907", x: "#FFFFFF66",
    },
    HIKING: {
        card: "#FFFDF8", ink: "#0E2A33", sub: "#0E2A33A6", faint: "#0E2A3380", accent: "#D9623C", onAccent: "#FFFFFF", chip: "#FFFFFF", chipLine: "#E6DFD1", chipInk: "#0E2A33CC",
        bannerBg: "#FFFFFF0A", bannerRing: "#F28C6A66", bannerInk: "#F4EFE3", bannerSub: "#F4EFE399", cta: "#F28C6A", onCta: "#2A1208", x: "#F4EFE366",
    },
    FISHING: {
        card: "#FBF8F1", ink: "#0B1E2D", sub: "#0B1E2DA6", faint: "#0B1E2D80", accent: "#F4A963", onAccent: "#2A1606", chip: "#FFFFFF", chipLine: "#E5DFD2", chipInk: "#0B1E2DCC",
        bannerBg: "#FFFFFF0A", bannerRing: "#F4A96366", bannerInk: "#F3ECDD", bannerSub: "#F3ECDD99", cta: "#F4A963", onCta: "#2A1606", x: "#F3ECDD66",
    },
};

/* ── 종목 그림(56px) — 단순한 도형만(사진 · 이모지 아님). 색은 그 종목의 것 ── */
function SportArt({ sport, size = 56 }: { sport: ProfileSport; size?: number }) {
    const common = { width: size, height: size, viewBox: "0 0 56 56", "aria-hidden": true as const, className: "shrink-0 rounded-[16px]" };
    if (sport === "BILLIARDS") return (
        <svg {...common}>
            <rect width="56" height="56" rx="16" fill="#0B5D3B" />
            <rect x="5" y="5" width="46" height="46" rx="12" fill="none" stroke="#FFFFFF1F" strokeWidth="1.5" />
            <circle cx="22" cy="31" r="9" fill="#F7F4EC" /><circle cx="19.5" cy="28" r="2.6" fill="#FFFFFF" />
            <circle cx="36.5" cy="23" r="7.5" fill="#D7372F" /><circle cx="34.5" cy="20.6" r="2.1" fill="#FFFFFF8C" />
        </svg>
    );
    if (sport === "GOLF") return (
        <svg {...common}>
            <rect width="56" height="56" rx="16" fill="#0F1A0B" />
            <path d="M0 40 C 14 31, 34 31, 56 38 L56 56 L0 56 Z" fill="#64DD17" opacity=".9" />
            <ellipse cx="33" cy="38" rx="4.2" ry="1.6" fill="#0F1A0B" />
            <path d="M33 38 V14" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M33 14.5 L44 18.5 L33 22.5 Z" fill="#FF6B00" />
            <circle cx="20" cy="41" r="2.6" fill="#FFFFFF" />
        </svg>
    );
    if (sport === "HIKING") return (
        <svg {...common}>
            <rect width="56" height="56" rx="16" fill="#123540" />
            <circle cx="38" cy="18" r="6.5" fill="#F28C6A" />
            <path d="M0 44 L15 26 L24 35 L33 22 L56 44 L56 56 L0 56 Z" fill="#F4EFE3" opacity=".22" />
            <path d="M0 50 L12 38 L21 45 L34 31 L56 50 L56 56 L0 56 Z" fill="#F4EFE3" opacity=".55" />
            <path d="M33 22 l-3.2 4.5 h6.4 z" fill="#F4EFE3" opacity=".9" />
        </svg>
    );
    return (
        <svg {...common}>
            <rect width="56" height="56" rx="16" fill="#123247" />
            <circle cx="40" cy="15" r="5.5" fill="#F4A963" opacity=".95" />
            <path d="M28 18 V27" stroke="#F3ECDD" strokeWidth="1.4" />
            <path d="M28 27 c-4.2 0-5.4 4.4-5.4 7.2 0 2.6 2.4 4.6 5.4 4.6s5.4-2 5.4-4.6c0-2.8-1.2-7.2-5.4-7.2z" fill="#E4553F" />
            <path d="M22.7 34.4 h10.6 c0 2.6-2.4 4.4-5.3 4.4s-5.3-1.8-5.3-4.4z" fill="#F7F1E4" />
            <path d="M4 42 q6 -4 12 0 t12 0 t12 0 t12 0" fill="none" stroke="#F3ECDD" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M-2 49 q6 -4 12 0 t12 0 t12 0 t12 0 t12 0" fill="none" stroke="#F3ECDD" strokeOpacity=".3" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

/* ── 창 여닫기 — 한 곳(Host)이 그린다 ── */
let opener: ((sport: ProfileSport) => void) | null = null;
/** 프로필 창을 연다(홈 배너 · 설정 등). Host 가 없으면 아무 일도 없다 */
export function openProfileBasics(sport: ProfileSport): void { opener?.(sport); }

function snoozed(): boolean {
    try {
        const v = Number(window.localStorage.getItem(PROFILE_NUDGE_SNOOZE_KEY));
        return Number.isFinite(v) && v > Date.now();
    } catch { return false; }
}
function snooze(): void {
    try { window.localStorage.setItem(PROFILE_NUDGE_SNOOZE_KEY, String(Date.now() + PROFILE_NUDGE_SNOOZE_DAYS * 86_400_000)); } catch { /* 저장 못 하면 이번 화면에서만 숨긴다 */ }
}

/** 종목 홈의 배너 — 두 가지 중 하나라도 비었을 때만, 회원에게만 */
export function ProfileNudge({ sport, className }: { sport: ProfileSport; className?: string }) {
    const { t } = useT();
    const { member } = useAuth();
    const [hidden, setHidden] = useState(snoozed);
    if (!member || hidden || !needsProfileBasics(member as never, kstYear())) return null;
    const c = TONE[sport];
    return (
        <div
            className={cn("relative flex items-center gap-3 rounded-[20px] py-3 pl-3 pr-2", className)}
            style={{ background: c.bannerBg, boxShadow: `inset 0 0 0 1px ${c.bannerRing}${sport === "BILLIARDS" ? ", 0 1px 2px rgba(0,0,0,.04)" : ""}` }}
            data-testid="profile-nudge" data-sport={sport}
        >
            <button type="button" onClick={() => openProfileBasics(sport)} className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-80" data-track-as="프로필 배너">
                <SportArt sport={sport} size={52} />
                <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-snug break-keep" style={{ color: c.bannerInk }} data-testid="profile-nudge-title">{t("profileBasics.banner.title")}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug break-keep" style={{ color: c.bannerSub }}>{t(`profileBasics.banner.${sport}`)}</span>
                </span>
                {/* 알약 단추 대신 화살표(2026-10-20 화면 확인) — 360 폭에서 알약이 제목을 두 줄로 밀었다. 배너 전체가 누르는 곳이다 */}
                <span className="sr-only">{t("profileBasics.banner.cta")}</span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: c.cta }} aria-hidden>
                    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke={c.onCta} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
                </span>
            </button>
            <button
                type="button" onClick={() => { snooze(); setHidden(true); }}
                aria-label={t("profileBasics.banner.dismiss")} title={t("profileBasics.banner.dismiss")}
                className="flex h-8 w-7 shrink-0 items-center justify-center rounded-full active:opacity-60" data-testid="profile-nudge-dismiss"
            >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden fill="none" stroke={c.x} strokeWidth="1.8" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
        </div>
    );
}

function Chip({ on, onClick, children, c, testid }: { on: boolean; onClick: () => void; children: ReactNode; c: Tone; testid?: string }) {
    return (
        <button
            type="button" onClick={onClick} aria-pressed={on}
            className="h-11 rounded-[14px] text-[14.5px] font-semibold transition-colors active:scale-[0.98]"
            style={on ? { background: c.accent, color: c.onAccent, boxShadow: "none" } : { background: c.chip, color: c.chipInk, boxShadow: `inset 0 0 0 1.5px ${c.chipLine}` }}
            data-testid={testid}
        >{children}</button>
    );
}

/** 가운데 창 — App 에 하나 */
export function ProfileBasicsHost() {
    const [sport, setSport] = useState<ProfileSport | null>(null);
    useEffect(() => { opener = (s) => setSport(s); return () => { opener = null; }; }, []);
    if (!sport) return null;
    return <ProfileBasicsDialog sport={sport} onClose={() => setSport(null)} />;
}

function ProfileBasicsDialog({ sport, onClose }: { sport: ProfileSport; onClose: () => void }) {
    const { t } = useT();
    const { member } = useAuth();
    const { toast } = useToast();
    const c = TONE[sport];
    const [gender, setGender] = useState<Gender | null>(isGender((member as { gender?: unknown } | null)?.gender) ? (member as { gender: Gender }).gender : null);
    const [age, setAge] = useState<AgeBand | null>(ageBandOf(member as never, kstYear()));
    const [busy, setBusy] = useState(false);
    useBackToClose(true, onClose);

    const save = async () => {
        if (!gender || !age) { toast({ title: t("profileBasics.pickBoth") }); return; }
        if (busy) return;
        setBusy(true);
        try {
            await apiRequest("/api/hiq/me", { method: "PATCH", body: JSON.stringify({ gender, ageBand: age }) });
            await queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
            toast({ title: t("profileBasics.saved") });
            onClose();
        } catch (e: unknown) {
            toast({ title: (e as { message?: string })?.message || t("settings.saveFailed"), variant: "destructive" });
        } finally { setBusy(false); }
    };

    return (
        <div role="dialog" aria-modal="true" aria-labelledby="profile-basics-title" className="fixed inset-0 z-[960] flex items-center justify-center bg-black/55 px-5" onClick={onClose} data-testid="profile-basics" data-sport={sport}>
            <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[360px] rounded-[28px] px-5 pb-4 pt-6 shadow-[0_24px_64px_rgba(0,0,0,0.35)]"
                style={{ background: c.card, color: c.ink }}
            >
                <div className="flex justify-center"><SportArt sport={sport} size={48} /></div>
                <p className="mt-3 text-center text-[12px] font-semibold" style={{ color: c.faint }}>{t("profileBasics.eyebrow")}</p>
                <h2 id="profile-basics-title" className="mt-1 text-center text-[20px] font-semibold leading-snug break-keep">{t("profileBasics.title")}</h2>
                <p className="mt-2 text-center text-[13px] leading-relaxed break-keep" style={{ color: c.sub }}>{t(`profileBasics.why.${sport}`)}</p>

                <p className="mt-5 text-[13px] font-semibold">{t("profileBasics.gender")}</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {(["male", "female"] as const).map((g) => (
                        <Chip key={g} on={gender === g} onClick={() => setGender(g)} c={c} testid={`profile-gender-${g}`}>{t(g === "male" ? "settings.male" : "settings.female")}</Chip>
                    ))}
                </div>
                <p className="mt-4 text-[13px] font-semibold">{t("profileBasics.age")}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {AGE_BANDS.map((a) => (
                        <Chip key={a} on={age === a} onClick={() => setAge(a)} c={c} testid={`profile-age-${a}`}>{t(`profileBasics.age.${a}`)}</Chip>
                    ))}
                </div>

                <button
                    type="button" onClick={() => void save()} disabled={busy}
                    className="mt-5 h-[52px] w-full rounded-2xl text-[15.5px] font-semibold transition-opacity disabled:opacity-60 active:scale-[0.99]"
                    style={{ background: c.accent, color: c.onAccent, opacity: gender && age ? 1 : 0.45 }}
                    data-testid="profile-basics-save"
                >{t("profileBasics.save")}</button>
                <button type="button" onClick={onClose} className="mt-1 h-10 w-full text-[13.5px] font-medium" style={{ color: c.faint }}>{t("profileBasics.later")}</button>
                <p className="mt-1 text-center text-[12px] leading-relaxed break-keep" style={{ color: c.faint }}>{t("profileBasics.privacy")}</p>
            </motion.div>
        </div>
    );
}
