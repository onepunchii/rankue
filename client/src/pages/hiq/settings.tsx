import { useEffect, useRef, useState } from "react";
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
import { NotificationKinds } from "@/components/hiq/settings/NotificationKinds";
import { PrimarySportSetting } from "@/components/hiq/sport/PrimarySportSetting";
import { PresenceSettings } from "@/components/hiq/presence/PresenceSettings";
import {
    canOpenNotificationSettings, forgetPushToken, isNativeApp, openNotificationSettings, pushPermission, requestPushPermission,
    storedPushToken, type PushPermission,
} from "@/lib/nativeBridge";
import {
    kakaoLoginAvailable, kakaoLoginOpen, kakaoNativeAvailable, kakaoNativeLink, kakaoNativeToken, useKakaoStart,
    type KakaoNativeToken,
} from "@/lib/kakaoLogin";

// 설정 — 전체메뉴 톱니바퀴 진입. 1순위: 계정 연결 상태 + 언어. (형 결정: 2026-07)
export default function HiqSettings() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { t, locale, setLocale } = useT();

    const { data: member } = useQuery<any>({ queryKey: ["/api/hiq/me"] });

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
    // 카카오 연결(2026-10-05 오너: "카카오도 오픈") — 전화번호로 가입한 회원이 카카오로 들어오면 계정이 둘로 갈린다.
    // 그래서 로그인한 채로 여기서 내 계정에 카카오를 붙인다: 로그인과 같은 길로 카카오에 다녀오고(/auth/kakao), 서버가 내 프로필에 적는다.
    // 단추는 한국어 화면 + 카카오 단추를 쓸 수 있는 곳(kakaoLoginAvailable — 웹, 그리고 네이티브 카카오 플러그인이 든 새 앱 1.3~.
    // 플러그인이 없는 앱에서는 카카오로 못 넘어가 숨긴다) + 프로필이 있는 회원에게만.
    // 매장에서 전화번호만으로 등록된 회원(profileId 없음)은 붙일 곳이 없어 서버가 409 로 거절한다 — 누를 수 없게 처음부터 숨긴다.
    // **로그인 PIN 이 있는 계정만**(conn.pin, 2026-10-05 검토): 연결은 쿠키만으로 해 주지 않고 PIN 으로 본인을 확인한다(돌아온 화면이 묻는다).
    // PIN 없는 계정(번호만으로 등록 · 구글·애플 전용)은 확인할 방법이 없어 서버가 거절하므로 단추도 보여 주지 않는다.
    // 기기에 남은 옛 '나' 답에는 pin 칸이 없다 — `=== true` 로 보고, 새 답이 오면 단추가 나타난다.
    const canLinkKakao = locale === "ko" && kakaoLoginAvailable() && !!member?.profileId && conn.pin === true && !conn.kakao;
    const { busy: kakaoLinking, start: startKakao } = useKakaoStart(canLinkKakao, () => {
        toast({ title: t("login.kakaoStartFailed"), variant: "destructive" });
    }, () => {
        // 카카오에 보냈던 이 화면이 되살아났다 — 새 탭·새 문서에서 연결이 끝났을 수 있으니 '나'를 다시 받아 '연결됨'으로 바뀌게 한다
        void queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
    });

    // 앱 안의 연결(2026-10-06 — 네이티브 카카오 플러그인이 든 새 앱 1.3~). 웹과 같은 순서다: 카카오에 먼저 다녀오고 → 로그인 PIN 을 받아 →
    // 서버에 같이 보낸다. 화면을 떠나지 않으므로 PIN 은 이 줄 바로 아래에서 받는다(웹은 돌아온 화면 /auth/kakao 가 받는다).
    // 받아 온 ID 토큰은 화면 메모리에만 있다. 서버는 PIN 을 토큰보다 먼저 보므로, PIN 이 틀렸을 때만 같은 토큰으로 다시 보낼 수 있다 —
    // 그 밖의 답(성공·다른 실패)이 오면 토큰은 끝난 것으로 보고 PIN 칸을 닫는다. 쿠키는 바뀌지 않는다('나'만 다시 받는다).
    const kakaoNative = kakaoNativeAvailable();
    const [nativeLink, setNativeLink] = useState<KakaoNativeToken | null>(null);
    const [nativeLinkBusy, setNativeLinkBusy] = useState(false);
    const [linkPin, setLinkPin] = useState("");
    const [linkPinError, setLinkPinError] = useState<string | null>(null);
    const nativeLinkLock = useRef(false);
    const startNativeLink = async () => {
        if (nativeLinkLock.current) return;
        nativeLinkLock.current = true;
        setNativeLinkBusy(true);
        try {
            const token = await kakaoNativeToken();
            // 취소했으면(null) 조용히 끝낸다
            if (token) {
                setLinkPin("");
                setLinkPinError(null);
                setNativeLink(token);
            }
        } catch (e) {
            console.error("[kakao] native link start failed:", e);
            toast({ title: t("login.kakaoStartFailed"), variant: "destructive" });
        } finally {
            nativeLinkLock.current = false;
            setNativeLinkBusy(false);
        }
    };
    const submitNativeLink = async () => {
        if (!nativeLink || nativeLinkLock.current || linkPin.length < 4) return;
        nativeLinkLock.current = true;
        setNativeLinkBusy(true);
        setLinkPinError(null);
        const result = await kakaoNativeLink(nativeLink, linkPin);
        nativeLinkLock.current = false;
        setNativeLinkBusy(false);
        setLinkPin("");
        if (result.kind === "wrong-pin") {
            // 토큰은 아직 쓰이지 않았다 — 같은 자리에서 PIN 만 다시 받는다
            setLinkPinError(result.message ?? t("kakao.pinWrong"));
            return;
        }
        setNativeLink(null);
        if (result.kind === "linked") {
            toast({ title: t("kakao.linked") });
            await queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
            return;
        }
        // 서버가 만든 문구(이미 다른 계정에 연결됨 등)가 있으면 그대로, 없으면 제목만
        toast({ title: t("kakao.linkFailTitle"), description: result.message ?? undefined, variant: "destructive" });
    };

    // 카카오 해제(2026-10-05 검토) — 연결만 있고 되돌릴 길이 없으면 잘못 붙은 카카오(가족 것·남이 붙여 둔 것)를 주인이 못 뗀다.
    // 연결과 같은 PIN 확인을 거친다. 전화번호로 가입한 계정에서만: 카카오로 가입한 계정은 떼면 들어올 길이 없어 서버가 거절한다.
    // 카카오에 다녀오지 않으므로 앱 안에서도 된다.
    const canUnlinkKakao = !!conn.kakao && conn.pin === true && !!conn.phone;
    const [unlinkOpen, setUnlinkOpen] = useState(false);
    const [unlinkPin, setUnlinkPin] = useState("");
    const [unlinking, setUnlinking] = useState(false);
    const unlinkKakao = async () => {
        if (unlinking || unlinkPin.length < 4) return;
        setUnlinking(true);
        try {
            await apiRequest("/api/hiq/social/kakao/link", { method: "DELETE", body: { pin: unlinkPin } });
            toast({ title: t("kakao.unlinked") });
            setUnlinkOpen(false);
            await queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        } catch (e: any) {
            // 서버가 만든 문구(PIN 이 틀림·시도가 많음)만 그대로 보여 준다 — 연결이 끊겼을 때의 원문은 우리 문구로 바꾼다
            const fromServer = e?.data?.success === false && typeof e.data.message === "string" ? e.data.message : "";
            toast({ title: fromServer || t("kakao.unlinkFailed"), variant: "destructive" });
        } finally {
            setUnlinkPin("");
            setUnlinking(false);
        }
    };

    // 앱 안의 한국어 화면: 카카오 줄이 '미연결'로만 보이고 왜 못 누르는지 설명이 없었다(2026-10-05 검토).
    // "웹에서 연결"만 적으면 웹에 가서 첫 단추인 '카카오로 시작하기'를 누르게 되고 그러면 빈 새 계정이 생긴다 —
    // 그래서 "전화번호로 로그인한 뒤"를 꼭 넣는다. 웹에서도 연결할 수 없는 회원(프로필·PIN 없음)에게는 거짓말이 되므로 보여 주지 않는다.
    // 네이티브 카카오 플러그인이 든 새 앱(1.3~)에서는 이 줄에 '연결' 단추가 있다 — 안내는 플러그인이 없는 앱(1.2 이하)에만 남긴다(2026-10-06).
    const kakaoLinkOnWebHint = kakaoLoginOpen() && isNativeApp() && !kakaoNative && locale === "ko" && !!member?.profileId && conn.pin === true && !!conn.phone && !conn.kakao;

    const connections: { key: string; label: string; linked: boolean; onLink?: () => void; onUnlink?: () => void }[] = [
        { key: "phone", label: t("settings.connPhone"), linked: !!conn.phone },
        // 카카오 줄은 한국어 화면이거나 이미 연결한 회원에게만 보인다 — 다른 언어 화면은 예전 그대로다
        // 카카오가 닫혀 있는 동안(새 앱 빌드 승인 전, 2026-10-06)에는 줄 자체를 그리지 않는다 — 이미 연결된 회원만 예외
        ...((locale === "ko" && kakaoLoginOpen()) || conn.kakao ? [{
            key: "kakao", label: t("settings.connKakao"), linked: !!conn.kakao,
            // 앱 안(플러그인 있음)은 화면을 떠나지 않는 네이티브 길, 웹은 카카오에 다녀오는 길(mode=link)
            onLink: canLinkKakao ? (kakaoNative ? () => { void startNativeLink(); } : () => startKakao({ mode: "link", redirect: "/settings" })) : undefined,
            onUnlink: canUnlinkKakao ? () => { setUnlinkPin(""); setUnlinkOpen((open) => !open); } : undefined,
        }] : []),
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

                {/* 알림 종류 — 당구 | 골프 탭, 종목마다 자기 색(2026-10-01 오너). 끄면 푸시만 멈추고 알림함에는 남는다.
                    OS 알림을 아예 꺼 둔 기기에서도 보여 준다 — 나중에 켰을 때의 설정이기도 하다. */}
                <NotificationKinds golfAllowed={!!member?.golfAccess} />

                {/* 주 종목(2026-10-01) — 앱을 열면 이 종목으로 시작한다. 골프를 쓰는 회원에게만 */}
                {member?.golfAccess && <PrimarySportSetting current={(member as any)?.primarySport ?? null} />}

                {/* 친구 접속(2026-10-01) — 앱 안 배너 받기·내 접속 알리기 */}
                {member && <PresenceSettings />}

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
                            <div key={c.key}>
                                <div className="flex items-center justify-between h-12 px-4 bg-black/[0.03] rounded-tile">
                                    <span className="text-[14px] font-medium">{c.label}</span>
                                    {c.linked ? (
                                        <span className="flex items-center gap-3">
                                            <span className="text-[12px] font-bold text-brand flex items-center gap-1"><LucideCheck className="w-3.5 h-3.5" /> {t("settings.linked")}</span>
                                            {c.onUnlink && (
                                                <button
                                                    type="button"
                                                    onClick={c.onUnlink}
                                                    aria-expanded={unlinkOpen}
                                                    aria-label={`${c.label} ${t("settings.disconnect")}`}
                                                    className="text-[12px] font-medium text-black/45 underline underline-offset-4 active:opacity-70"
                                                >
                                                    {t("settings.disconnect")}
                                                </button>
                                            )}
                                        </span>
                                    ) : c.onLink ? (
                                        <button
                                            type="button"
                                            onClick={c.onLink}
                                            disabled={kakaoLinking || nativeLinkBusy || !!nativeLink}
                                            aria-label={`${c.label} ${t("settings.connect")}`}
                                            className="h-8 px-3.5 rounded-full bg-brand/[0.1] text-[12.5px] font-bold text-brand disabled:opacity-50 active:scale-[0.97] transition-transform"
                                        >
                                            {t("settings.connect")}
                                        </button>
                                    ) : (
                                        <span className="text-[12px] font-medium text-black/30">{t("settings.notLinked")}</span>
                                    )}
                                </div>
                                {/* 앱 안의 연결 — 카카오에 다녀온 뒤 로그인 PIN 으로 본인 확인을 받는다(해제와 같은 모양으로 줄 아래에서 바로).
                                    PIN 은 화면 상태에만 있고 보낸 뒤 지운다. */}
                                {c.key === "kakao" && nativeLink && (
                                    <form
                                        onSubmit={(e) => { e.preventDefault(); void submitNativeLink(); }}
                                        className="mt-2 px-1"
                                    >
                                        <p className="text-[12px] text-black/55 mb-2 break-keep">{t("kakao.pinDesc")}</p>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="password"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                autoComplete="current-password"
                                                autoFocus
                                                aria-label={t("login.pinPlaceholder")}
                                                placeholder={t("login.pinPlaceholder")}
                                                value={linkPin}
                                                onChange={(e) => { setLinkPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8)); setLinkPinError(null); }}
                                                className="flex-1 min-w-0 h-12 px-4 bg-black/[0.04] rounded-tile outline-none text-[15px] font-semibold tabular-nums"
                                            />
                                            <button
                                                type="submit"
                                                disabled={nativeLinkBusy || linkPin.length < 4}
                                                aria-busy={nativeLinkBusy}
                                                className="h-12 px-4 shrink-0 rounded-tile bg-brand text-brand-fg text-[13.5px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                                            >
                                                {nativeLinkBusy ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : t("settings.connect")}
                                            </button>
                                        </div>
                                        {linkPinError && <p role="alert" className="text-[12.5px] font-medium text-red-500 mt-2 break-keep">{linkPinError}</p>}
                                        <button
                                            type="button"
                                            onClick={() => { setNativeLink(null); setLinkPin(""); setLinkPinError(null); }}
                                            className="mt-1 h-11 text-[12.5px] font-medium text-black/45 underline underline-offset-4 active:opacity-70"
                                        >
                                            {t("common.cancel")}
                                        </button>
                                    </form>
                                )}
                                {/* 해제 — 로그인 PIN 으로 본인 확인을 한 번 더 받는다(브라우저 기본 창을 쓰지 않고 줄 아래에서 바로) */}
                                {c.onUnlink && unlinkOpen && (
                                    <form
                                        onSubmit={(e) => { e.preventDefault(); void unlinkKakao(); }}
                                        className="mt-2 px-1"
                                    >
                                        <p className="text-[12px] text-black/55 mb-2 break-keep">{t("kakao.unlinkPinDesc")}</p>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="password"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                autoComplete="current-password"
                                                autoFocus
                                                aria-label={t("login.pinPlaceholder")}
                                                placeholder={t("login.pinPlaceholder")}
                                                value={unlinkPin}
                                                onChange={(e) => setUnlinkPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                                                className="flex-1 min-w-0 h-12 px-4 bg-black/[0.04] rounded-tile outline-none text-[15px] font-semibold tabular-nums"
                                            />
                                            <button
                                                type="submit"
                                                disabled={unlinking || unlinkPin.length < 4}
                                                className="h-12 px-4 shrink-0 rounded-tile bg-black/[0.08] text-[13.5px] font-bold text-ink-1 disabled:opacity-40 active:scale-[0.98] transition-transform"
                                            >
                                                {unlinking ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : t("settings.disconnect")}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        ))}
                    </div>
                    {kakaoLinkOnWebHint && (
                        <p className="text-[12px] text-black/45 mt-3 leading-relaxed break-keep">{t("settings.kakaoLinkOnWeb")}</p>
                    )}
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
