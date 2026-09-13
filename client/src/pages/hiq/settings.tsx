import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LucideChevronLeft, LucideChevronRight, LucideCheck, LucideLoader2, LucideGlobe, LucidePencil, LucideBadgeCheck, LucideShield, LucideLogOut, LucideBell, LucideFileText } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT, LOCALES, type Locale } from "@/lib/i18n";
import { flagEmoji } from "@/lib/flag";
import { cn } from "@/lib/utils";
import { BlockedMembersSection } from "@/components/hiq/community/BlockedMembersSection";
import { prefsForSport, type PrefKey, type PrefMeta } from "@shared/notificationPrefs";
import {
    canOpenNotificationSettings, forgetPushToken, isNativeApp, openNotificationSettings, pushPermission, requestPushPermission,
    storedPushToken, type PushPermission,
} from "@/lib/nativeBridge";

// 설정 — 전체메뉴 톱니바퀴 진입. 1순위: 계정 연결 상태 + 언어. (형 결정: 2026-07)
export default function HiqSettings() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { t, locale, setLocale } = useT();

    const { data: member } = useQuery<any>({ queryKey: ["/api/hiq/me"] });

    /**
     * 알림 카테고리별 켬/끔(2026-09-13 오너). 끄면 그 묶음의 **푸시만** 멈추고 알림함에는 그대로 쌓인다.
     * 낙관적으로 먼저 뒤집고(스위치가 손가락을 따라와야 한다) 실패하면 되돌린다.
     */
    const { data: prefsData } = useQuery<{ prefs: Record<PrefKey, boolean> }>({ queryKey: ["/api/hiq/me/notification-prefs"] });
    const [prefBusy, setPrefBusy] = useState<PrefKey | null>(null);
    const prefs = prefsData?.prefs;
    const togglePref = async (key: PrefKey) => {
        if (!prefs || prefBusy) return;
        const next = !prefs[key];
        setPrefBusy(key);
        queryClient.setQueryData(["/api/hiq/me/notification-prefs"], { prefs: { ...prefs, [key]: next } });
        try {
            await apiRequest("/api/hiq/me/notification-prefs", { method: "PATCH", body: { prefs: { [key]: next } } });
        } catch {
            queryClient.setQueryData(["/api/hiq/me/notification-prefs"], { prefs });
            toast({ title: t("settings.notifPrefFailed"), variant: "destructive" });
        } finally {
            setPrefBusy(null);
            void queryClient.invalidateQueries({ queryKey: ["/api/hiq/me/notification-prefs"] });
        }
    };

    // 알림 권한 — 앱에서만 보인다. OS 설정에서 바꾸고 돌아오면(화면이 다시 보이면) 다시 읽는다.
    const [pushPerm, setPushPerm] = useState<PushPermission>("unsupported");
    useEffect(() => {
        if (!isNativeApp()) return;
        let alive = true;
        const check = () => { void pushPermission().then((p) => { if (alive) setPushPerm(p); }); };
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        check();
        document.addEventListener("visibilitychange", onVisible);
        return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); };
    }, []);
    const enablePush = async () => setPushPerm(await requestPushPermission());
    const pushLabel = pushPerm === "granted" ? t("settings.notifOn") : pushPerm === "denied" ? t("settings.notifOff") : t("settings.notifNotSet");

    // @핸들 변경
    const [handleInput, setHandleInput] = useState<string | null>(null);
    const [handleSaving, setHandleSaving] = useState(false);
    const currentHandle = member?.handle ?? "";
    const editingHandle = handleInput ?? currentHandle;

    const saveHandle = async () => {
        if (handleSaving || !handleInput || handleInput === currentHandle) return;
        setHandleSaving(true);
        try {
            await apiRequest("/api/hiq/me/handle", { method: "PATCH", body: JSON.stringify({ handle: handleInput }) });
            toast({ title: `@${handleInput}` });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
            setHandleInput(null);
        } catch (e: any) {
            toast({ title: e?.message || t("settings.handleChangeFailed"), variant: "destructive" });
        } finally {
            setHandleSaving(false);
        }
    };

    const handleLogout = async () => {
        // 이 기기 푸시 토큰도 함께 보내 서버가 지우게 한다 — 안 지우면 로그아웃한 폰에 이전 계정 알림(채팅 미리보기 등)이 계속 온다.
        const pushToken = storedPushToken();
        try { await apiRequest("/api/hiq/logout", { method: "POST", body: pushToken ? { pushToken } : undefined }); } catch { /* ignore */ }
        forgetPushToken();
        queryClient.clear();
        setLocation("/");
    };

    // 프로필 선택 정보(성별·출생연도) 저장 — 탭 즉시 저장, 실패는 토스트
    const saveProfileField = async (patch: { gender?: "male" | "female"; birthYear?: number }) => {
        try {
            await apiRequest("/api/hiq/me", { method: "PATCH", body: JSON.stringify(patch) });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        } catch (e: any) {
            toast({ title: e?.message || t("settings.saveFailed"), variant: "destructive" });
        }
    };

    // 커뮤니티 실력 뱃지 토글 — 기본 표시, 끄면 글·댓글에서 다마수·에버리지 숨김
    const toggleSkillBadge = async () => {
        try {
            await apiRequest("/api/hiq/me", { method: "PATCH", body: JSON.stringify({ hideSkillBadge: !member?.hideSkillBadge }) });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        } catch (e: any) {
            toast({ title: e?.message || t("settings.saveFailed"), variant: "destructive" });
        }
    };

    const conn = member?.connections ?? {};
    const connections: { key: string; label: string; linked: boolean }[] = [
        { key: "phone", label: t("settings.connPhone"), linked: !!conn.phone },
        { key: "google", label: "Google", linked: !!conn.google },
        { key: "apple", label: "Apple", linked: !!conn.apple },
    ];

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-32 font-sans">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8 pt-5">
                <button title={t("settings.back")} onClick={() => setLocation("/menu")} className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center active:bg-black/[0.06]">
                    <LucideChevronLeft className="w-6 h-6 text-black/55" />
                </button>
                <h1 className="text-[26px] font-bold tracking-tight">{t("settings.title")}</h1>
            </div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                {/* @핸들 */}
                <section className="rk-card p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <LucidePencil className="w-4 h-4 text-brand" />
                        <h2 className="text-[15px] font-bold">{t("settings.myHandle")}</h2>
                    </div>
                    <p className="text-[12px] text-black/45 mb-4">{t("settings.handleDesc")}</p>
                    <div className="flex items-center gap-2">
                        {/* min-w-0 필수 — input의 고유 최소폭이 행을 카드 밖으로 밀어내는 것 방지(모바일) */}
                        <div className="flex-1 min-w-0 flex items-center h-12 px-4 bg-black/[0.04] rounded-tile">
                            <span className="text-black/40 mr-0.5 shrink-0">@</span>
                            <input
                                value={editingHandle}
                                onChange={(e) => setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
                                className="w-full min-w-0 bg-transparent outline-none text-[15px] font-semibold"
                                placeholder="handle"
                            />
                        </div>
                        {/* 아이콘 버튼(정사각 고정) — 버튼 텍스트가 언어마다 길어져 입력창을
                            밀어내던 문제 제거. 입력창이 항상 넓게 확보됨. 접근성은 aria-label로. */}
                        <button
                            onClick={saveHandle}
                            disabled={handleSaving || !handleInput || handleInput === currentHandle}
                            aria-label={t("settings.change")}
                            title={t("settings.change")}
                            className="h-12 w-12 shrink-0 rounded-tile bg-brand text-brand-fg disabled:opacity-25 flex items-center justify-center"
                        >
                            {handleSaving ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : <LucideCheck className="w-5 h-5" />}
                        </button>
                    </div>
                </section>

                {/* 내 프로필 — 가입에서 옮겨온 선택 정보(성별·출생연도). 소셜·전화 유저 공통 입력처 */}
                <section className="rk-card p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <LucideBadgeCheck className="w-4 h-4 text-brand" />
                        <h2 className="text-[15px] font-bold">{t("settings.profile")}</h2>
                    </div>
                    <p className="text-[12px] text-black/45 mb-4">{t("settings.profileDesc")}</p>
                    <div className="flex gap-2 mb-3">
                        {(["male", "female"] as const).map((g) => (
                            <button
                                key={g}
                                onClick={() => saveProfileField({ gender: g })}
                                className={cn(
                                    "flex-1 h-12 rounded-tile text-[14px] font-semibold transition-colors",
                                    member?.gender === g ? "bg-brand text-brand-fg" : "bg-black/[0.04] text-black/60"
                                )}
                            >
                                {g === "male" ? t("settings.male") : t("settings.female")}
                            </button>
                        ))}
                    </div>
                    <select
                        value={member?.birthYear ?? ""}
                        onChange={(e) => { const v = Number(e.target.value); if (v) saveProfileField({ birthYear: v }); }}
                        aria-label={t("settings.birthYear")}
                        className="w-full h-12 px-4 bg-black/[0.04] rounded-tile text-[14px] font-semibold outline-none cursor-pointer"
                    >
                        <option value="">{t("settings.birthYear")}</option>
                        {Array.from({ length: 81 }, (_, i) => 2010 - i).map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </section>

                {/* 언어 */}
                <section className="rk-card p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <LucideGlobe className="w-4 h-4 text-brand" />
                        <h2 className="text-[15px] font-bold">{t("settings.language")}</h2>
                    </div>
                    <p className="text-[12px] text-black/45 mb-4">{flagEmoji(member?.countryCode)} {t("settings.languageDesc")}</p>
                    <div className="grid grid-cols-2 gap-2">
                        {LOCALES.map((l) => (
                            <button
                                key={l.code}
                                onClick={() => setLocale(l.code as Locale)}
                                className={cn(
                                    "h-12 rounded-tile text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors",
                                    locale === l.code ? "bg-brand text-brand-fg" : "bg-black/[0.04] text-black/60"
                                )}
                            >
                                {locale === l.code && <LucideCheck className="w-4 h-4" />}
                                {l.label}
                            </button>
                        ))}
                    </div>
                </section>

                {/* 알림 — 앱에서만. 상태와 복구 경로(거부했으면 설정 열기 — iOS 는 앱이 다시 물을 수 없다) */}
                {pushPerm !== "unsupported" && (
                    <section className="rk-card p-5">
                        <div className="flex items-center gap-2 mb-1">
                            <LucideBell className="w-4 h-4 text-brand" />
                            <h2 className="text-[15px] font-bold">{t("settings.notifications")}</h2>
                        </div>
                        <p className="text-[12px] text-black/45 mb-4">{t("settings.notificationsDesc")}</p>
                        <div className="flex items-center justify-between h-12 px-4 bg-black/[0.03] rounded-tile">
                            <span className="text-[14px] font-medium">{t("settings.notifStatus")}</span>
                            <span className={cn("text-[12px] font-bold", pushPerm === "granted" ? "text-brand" : "text-black/55")}>{pushLabel}</span>
                        </div>
                        {pushPerm === "prompt" && (
                            <button onClick={enablePush} className="mt-2 w-full h-12 rounded-tile bg-brand text-brand-fg text-[14px] font-semibold active:scale-[0.98] transition-transform">
                                {t("settings.notifEnable")}
                            </button>
                        )}
                        {pushPerm === "denied" && (
                            <>
                                <p className="text-[12px] text-black/55 mt-3">{t("settings.notifDeniedHint")}</p>
                                {canOpenNotificationSettings() && (
                                    <button onClick={() => void openNotificationSettings()} className="mt-2 w-full h-12 rounded-tile bg-black/[0.06] text-[14px] font-semibold active:scale-[0.98] transition-transform">
                                        {t("settings.notifOpenSettings")}
                                    </button>
                                )}
                            </>
                        )}
                    </section>
                )}

                {/* 알림 종류 — 카테고리별로 끈다(2026-09-13 오너). 끄면 푸시만 멈추고 알림함에는 남는다.
                    OS 알림을 아예 꺼 둔 기기에서도 보여 준다 — 나중에 켰을 때의 설정이기도 하다.
                    종목으로 묶는다: 골프 칸은 골프를 쓰는 회원에게만(안 쓰는 사람에게 빈 스위치를 주지 않는다). */}
                {prefs && (
                    <section className="rk-card p-5">
                        <div className="flex items-center gap-2 mb-1">
                            <LucideBell className="w-4 h-4 text-brand" />
                            <h2 className="text-[15px] font-bold">{t("settings.notifKinds")}</h2>
                        </div>
                        <p className="text-[12px] text-black/45 mb-4">{t("settings.notifKindsDesc")}</p>
                        {([["BILLIARDS", "settings.notifSportBilliards"], ["GOLF", "settings.notifSportGolf"]] as const).map(([sport, label]) => {
                            const rows = prefsForSport(sport);
                            if (rows.length === 0 || (sport === "GOLF" && !member?.golfAccess)) return null;
                            return (
                                <div key={sport} className="mb-4 last:mb-0">
                                    {member?.golfAccess && <p className="text-[11.5px] font-bold text-black/40 mb-1.5">{t(label)}</p>}
                                    <div className="space-y-2">
                                        {rows.map((p: PrefMeta) => (
                                            <button
                                                key={p.key}
                                                onClick={() => { void togglePref(p.key); }}
                                                disabled={prefBusy !== null}
                                                aria-pressed={prefs[p.key]}
                                                className="w-full flex items-center justify-between gap-3 min-h-[52px] px-4 py-2.5 bg-black/[0.03] rounded-tile text-left disabled:opacity-60"
                                            >
                                                <span className="min-w-0">
                                                    <span className="block text-[14px] font-medium">{t(p.title)}</span>
                                                    <span className="block text-[11.5px] text-black/45 mt-0.5">{t(p.desc)}</span>
                                                </span>
                                                <span className={cn("relative w-11 h-6 rounded-full shrink-0 transition-colors", prefs[p.key] ? "bg-brand" : "bg-black/[0.12]")}>
                                                    <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", prefs[p.key] ? "left-[22px]" : "left-0.5")} />
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                {/* 커뮤니티 */}
                <section className="rk-card p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <LucideBadgeCheck className="w-4 h-4 text-brand" />
                        <h2 className="text-[15px] font-bold">{t("settings.community")}</h2>
                    </div>
                    <p className="text-[12px] text-black/45 mb-4">{t("settings.skillBadgeDesc")}</p>
                    <button
                        onClick={toggleSkillBadge}
                        className="w-full flex items-center justify-between h-12 px-4 bg-black/[0.03] rounded-tile"
                    >
                        <span className="text-[14px] font-medium">{t("settings.skillBadge")}</span>
                        <span className={cn(
                            "relative w-11 h-6 rounded-full transition-colors",
                            member?.hideSkillBadge ? "bg-black/[0.12]" : "bg-brand"
                        )}>
                            <span className={cn(
                                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                                member?.hideSkillBadge ? "left-0.5" : "left-[22px]"
                            )} />
                        </span>
                    </button>
                </section>

                {/* 차단한 사용자 — 커뮤니티·크루 어디서 차단했든 여기서 푼다 */}
                <BlockedMembersSection />

                {/* 연결된 로그인 */}
                <section className="rk-card p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <LucideBadgeCheck className="w-4 h-4 text-brand" />
                        <h2 className="text-[15px] font-bold">{t("settings.connections")}</h2>
                    </div>
                    <p className="text-[12px] text-black/45 mb-4">{t("settings.connectionsDesc")}</p>
                    <div className="space-y-2">
                        {connections.map((c) => (
                            <div key={c.key} className="flex items-center justify-between h-12 px-4 bg-black/[0.03] rounded-tile">
                                <span className="text-[14px] font-medium">{c.label}</span>
                                {c.linked ? (
                                    <span className="text-[12px] font-bold text-brand flex items-center gap-1"><LucideCheck className="w-3.5 h-3.5" /> {t("settings.linked")}</span>
                                ) : (
                                    <span className="text-[12px] font-medium text-black/30">{t("settings.notLinked")}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* 법적 고지 · 계정 */}
                <section className="rk-card overflow-hidden">
                    <button onClick={() => setLocation("/terms")} className="w-full flex items-center justify-between px-5 h-14 active:bg-black/[0.03]">
                        <span className="flex items-center gap-2 text-[14px] font-medium"><LucideFileText className="w-4 h-4 text-black/40" /> {t("settings.terms")}</span>
                        <LucideChevronRight className="w-4 h-4 text-black/25" />
                    </button>
                    <div className="h-px bg-black/[0.05] mx-5" />
                    <button onClick={() => setLocation("/privacy")} className="w-full flex items-center justify-between px-5 h-14 active:bg-black/[0.03]">
                        <span className="flex items-center gap-2 text-[14px] font-medium"><LucideShield className="w-4 h-4 text-black/40" /> {t("settings.privacy")}</span>
                        <LucideChevronRight className="w-4 h-4 text-black/25" />
                    </button>
                    <div className="h-px bg-black/[0.05] mx-5" />
                    <button onClick={handleLogout} className="w-full flex items-center justify-between px-5 h-14 active:bg-black/[0.03]">
                        <span className="flex items-center gap-2 text-[14px] font-medium text-red-500"><LucideLogOut className="w-4 h-4" /> {t("settings.logout")}</span>
                    </button>
                </section>

                <p className="text-center text-[11px] text-black/30">RANKUE · {member?.handle ? `@${member.handle}` : ""}</p>
            </motion.div>
        </div>
    );
}
