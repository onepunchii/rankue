/**
 * 설정 → 알림 종류(2026-10-01 오너: "당구만 상세 알림 토글이 있다 — 골프도 만들고, 골프·당구 구별 잘되게 보기 편하게").
 *
 * 그전엔 당구 여섯 칸 밑에 '골프' 한 칸이 같은 모양으로 붙어 있어서, 어느 줄이 어느 종목인지 한눈에 안 갈렸다.
 *  - 맨 위 **당구 | 골프** 두 칸 탭 — 지금 쓰는 종목이 먼저 열린다. 탭마다 켜진 수(4/6)를 보여 준다.
 *  - 종목마다 **자기 색**: 당구는 당구대 초록, 골프는 잔디 라임. 테마(당구 밝음·골프 어두움)와 상관없이 같은 색이라
 *    골프 화면에서 당구 탭을 열어도 "이건 당구 줄"이 색으로 바로 읽힌다. 아이콘 칩도 그 색.
 *  - 종목 머리에 **모두 켜기/끄기** — 한 종목 알림을 통째로 쉬게 할 수 있다(한 번의 요청으로 그 종목 칸 전부).
 * 끄면 그 묶음의 **푸시만** 멈추고 알림함에는 그대로 쌓인다(shared/notificationPrefs). 스위치는 낙관적으로 먼저 뒤집고 실패하면 되돌린다.
 */
import { useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
    LucideBell, LucideUsers, LucideUsersRound, LucideTrophy, LucideMedal, LucideMegaphone, LucideCalendarCheck,
    LucideZap, LucideStar, LucideMessageCircle, LucideFlag, GameController,
} from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { useSport } from "@/contexts/SportContext";
import { cn } from "@/lib/utils";
import { prefsForSport, type PrefKey, type SportScope } from "@shared/notificationPrefs";

const PREFS_KEY = ["/api/hiq/me/notification-prefs"] as const;
type Prefs = Partial<Record<PrefKey, boolean>>;

/** 종목 색 — 테마와 무관한 고정색(구별이 목적). 당구 = 당구대 초록, 골프 = 잔디 라임 */
const SPORT = {
    BILLIARDS: { label: "settings.notifSportBilliards", accent: "#12805C", tint: "#12805C1F", knobOn: "#ffffff", Icon: GameController },
    GOLF: { label: "settings.notifSportGolf", accent: "#5CC417", tint: "#5CC41724", knobOn: "#ffffff", Icon: LucideFlag },
} as const;

const ICON: Record<string, ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    sim: GameController, rooms: LucideUsers, crew: LucideUsersRound, game: LucideTrophy, players: LucideMedal, notice: LucideMegaphone,
    golf_join: LucideCalendarCheck, golf_urgent: LucideZap, golf_watch: LucideStar, golf_chat: LucideMessageCircle,
    golf_crew: LucideUsersRound, golf_players: LucideMedal, golf_notice: LucideMegaphone,
};

/** 스위치 — 손잡이는 늘 흰색(골프 테마가 bg-white 를 어둡게 바꿔 끼워서 리터럴로), 꺼짐 바탕은 두 테마에서 다 보이는 회색 */
function Switch({ on, accent }: { on: boolean; accent: string }) {
    return (
        <span aria-hidden className="relative w-11 h-6 rounded-full shrink-0 transition-colors" style={{ backgroundColor: on ? accent : "rgba(120,120,128,0.32)" }}>
            <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-[#ffffff] shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
        </span>
    );
}

export function NotificationKinds({ golfAllowed }: { golfAllowed: boolean }) {
    const { t } = useT();
    const { toast } = useToast();
    const qc = useQueryClient();
    const { currentSport } = useSport();
    const { data } = useQuery<{ prefs: Prefs }>({ queryKey: PREFS_KEY });
    const prefs = data?.prefs;
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState<SportScope>(golfAllowed && currentSport === "GOLF" ? "GOLF" : "BILLIARDS");
    const sport: SportScope = golfAllowed ? tab : "BILLIARDS";

    /** 여러 칸을 한 번에(모두 켜기·끄기도 이 길) — 먼저 뒤집고, 실패하면 되돌린다 */
    const save = async (patch: Prefs) => {
        if (!prefs || busy) return;
        setBusy(true);
        qc.setQueryData(PREFS_KEY, { prefs: { ...prefs, ...patch } });
        try {
            await apiRequest(PREFS_KEY[0], { method: "PATCH", body: { prefs: patch } });
        } catch {
            qc.setQueryData(PREFS_KEY, { prefs });
            toast({ title: t("settings.notifPrefFailed"), variant: "destructive" });
        } finally {
            setBusy(false);
            void qc.invalidateQueries({ queryKey: PREFS_KEY });
        }
    };

    if (!prefs) return null;
    const onCount = (s: SportScope) => prefsForSport(s).filter((p) => prefs[p.key] !== false).length;
    const rows = prefsForSport(sport);
    const meta = SPORT[sport];
    const on = onCount(sport);
    const allOn = on === rows.length;

    return (
        <section className="rk-card p-5">
            <div className="flex items-center gap-2 mb-1">
                <LucideBell className="w-4 h-4 text-brand" />
                <h2 className="text-[15px] font-bold">{t("settings.notifKinds")}</h2>
            </div>
            <p className="text-[12px] text-black/45 mb-4">{t("settings.notifKindsDesc")}</p>

            {/* 당구 | 골프 — 골프를 쓰는 회원에게만 탭이 보인다 */}
            {golfAllowed && (
                <div role="tablist" aria-label={t("settings.notifKinds")} className="grid grid-cols-2 gap-1 p-1 mb-4 rounded-tile bg-black/[0.05]">
                    {(["BILLIARDS", "GOLF"] as const).map((s) => {
                        const m = SPORT[s];
                        const active = s === sport;
                        const n = prefsForSport(s).length;
                        return (
                            <button
                                key={s} type="button" role="tab" aria-selected={active} onClick={() => setTab(s)}
                                className={cn(
                                    "h-11 rounded-[10px] flex items-center justify-center gap-2 text-[14px] font-semibold transition-colors",
                                    active ? "bg-white shadow-sm text-black/85" : "text-black/45",
                                )}
                                // 고른 탭은 그 종목 색 테두리 — 어두운 골프 테마에서도 어느 탭이 열렸는지 또렷하게
                                style={active ? { boxShadow: `inset 0 0 0 1.5px ${m.accent}66` } : undefined}
                            >
                                <m.Icon className="w-4 h-4" style={{ color: active ? m.accent : undefined }} />
                                {t(m.label)}
                                <span
                                    className="min-w-[30px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-5 tabular-nums"
                                    style={active ? { backgroundColor: m.tint, color: m.accent } : { backgroundColor: "rgba(0,0,0,0.06)" }}
                                >
                                    {onCount(s)}/{n}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* 종목 머리 — 색 막대 + 켜진 수 + 모두 켜기/끄기 */}
            <div className="flex items-center gap-2 mb-2.5 pl-3 border-l-[3px]" style={{ borderColor: meta.accent }}>
                <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-bold">{t(meta.label)}</span>
                    <span className="block text-[11.5px] text-black/45 tabular-nums">
                        {t("settings.notifOnCount").replace("{on}", String(on)).replace("{n}", String(rows.length))}
                    </span>
                </span>
                <button
                    type="button" disabled={busy}
                    onClick={() => void save(Object.fromEntries(rows.map((p) => [p.key, !allOn])) as Prefs)}
                    className="shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold disabled:opacity-50"
                    style={{ backgroundColor: meta.tint, color: meta.accent }}
                >
                    {allOn ? t("settings.notifAllOff") : t("settings.notifAllOn")}
                </button>
            </div>

            <div className="space-y-2" role="tabpanel">
                {rows.map((p) => {
                    const isOn = prefs[p.key] !== false;
                    const Icon = ICON[p.key] ?? LucideBell;
                    return (
                        <button
                            key={p.key} type="button" onClick={() => void save({ [p.key]: !isOn })} disabled={busy} aria-pressed={isOn}
                            className="w-full flex items-center gap-3 min-h-[56px] px-3.5 py-2.5 bg-black/[0.03] rounded-tile text-left disabled:opacity-60"
                        >
                            <span className="shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ backgroundColor: meta.tint }}>
                                <Icon className="w-[18px] h-[18px]" style={{ color: meta.accent }} />
                            </span>
                            <span className="flex-1 min-w-0">
                                <span className={cn("block text-[14px] font-medium", !isOn && "text-black/55")}>{t(p.title)}</span>
                                <span className="block text-[11.5px] text-black/45 mt-0.5 break-keep">{t(p.desc)}</span>
                            </span>
                            <Switch on={isOn} accent={meta.accent} />
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
