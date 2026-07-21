import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LucideChevronLeft, LucideChevronRight, LucideCheck, LucideLoader2, LucideGlobe, LucidePencil, LucideBadgeCheck, LucideShield, LucideLogOut } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useT, LOCALES, type Locale } from "@/lib/i18n";
import { flagEmoji } from "@/lib/flag";
import { cn } from "@/lib/utils";

// 설정 — 전체메뉴 톱니바퀴 진입. 1순위: 계정 연결 상태 + 언어. (형 결정: 2026-07)
export default function HiqSettings() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { t, locale, setLocale } = useT();

    const { data: member } = useQuery<any>({ queryKey: ["/api/hiq/me"] });

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
        try { await apiRequest("/api/hiq/logout", { method: "POST" }); } catch { /* ignore */ }
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

    const conn = member?.connections ?? {};
    const connections: { key: string; label: string; linked: boolean }[] = [
        { key: "phone", label: t("settings.connPhone"), linked: !!conn.phone },
        { key: "google", label: "Google", linked: !!conn.google },
        { key: "apple", label: "Apple", linked: !!conn.apple },
    ];

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-ink-1 px-5 pt-6 pb-32 font-sans">
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
                        <button
                            onClick={saveHandle}
                            disabled={handleSaving || !handleInput || handleInput === currentHandle}
                            className="h-12 px-5 shrink-0 whitespace-nowrap rounded-tile bg-brand text-brand-fg text-[14px] font-bold disabled:opacity-25 flex items-center gap-1.5"
                        >
                            {handleSaving ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <LucideCheck className="w-4 h-4" />}
                            {t("settings.change")}
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
