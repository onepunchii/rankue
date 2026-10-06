/**
 * 어드민 · 회원 상세(2026-09-26 오너: "회원관리 보기 어렵고 수정·변경이 가능하게").
 * 14칸짜리 가로 표 한 줄에 흩어져 있던 정보를 한 장에 모으고, 여기서 바로 고친다.
 *  - 정보 수정: 이름·성별·출생연도·핸디(서버 PATCH /admin/members/:id — 전화번호·RP 는 받지 않는다)
 *  - 조치: 경기 기록 정리 · 알림 보내기 · PIN 초기화 · 계정 정지/해제 · 골프 부킹매니저 켜기/끄기
 *
 * 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자".
 *  - '골프' 칸: 등급·공식 평균·베스트·공식 라운드 · 현장 인증 비율 · 최근 라운드 10 · 조인/부킹 신청 평판(신청·승인·취소·노쇼) · 올린 글.
 *    회원 목록에 싣지 않고 시트를 열 때 GET /admin/members/:id/golf 로 따로 부른다 — 목록은 기기에 7일 저장되는 응답이라 모양을 안 바꾼다.
 *    노쇼·취소 이력은 평판 정보라 캐시에 남기지 않는다(gcTime 0).
 *  - 부킹매니저: 계정 역할 한 칸(profiles.role)이라 일반 회원 ↔ 부킹매니저만 오간다. 사장님·관리자는 이미 매장 판매자라 잠가 둔다
 *    (규칙과 이유는 shared/adminMemberGolf.ts 머리말).
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucidePhone, LucideBell, LucideHistory, LucideKeyRound, LucideShieldAlert, LucideSave, LucideStore, LucideMessageCircle } from "@/lib/icons";
import MemberGamesDialog from "./MemberGamesDialog";
import { PlatformIcon, CountryFlag, Pill, kstDate, lastSeenLabel, lastSeenTone, isRealPhone, phoneLabel, isKstToday } from "./adminUtils";
import { TODAY_ACTIVE_KEY } from "./TodayActiveView";
import { appConfirm, appAlert } from "@/components/AppDialog";
import { useT } from "@/lib/i18n";
import { bookingManagerState, type AdminMemberGolf, type BookingManagerState } from "@shared/adminMemberGolf";
import { isWithdrawnMember } from "@shared/chatSupport";

export type AdminMember = {
    id: string;
    name: string;
    phone: string;
    storeId: string;
    storeName: string | null;
    storeSlug: string | null;
    gender: "male" | "female" | null;
    birthYear: number | null;
    handi3c: number | null;
    handi4c: number | null;
    rating3c: number | null;
    rating4c: number | null;
    avg3c: number | null;
    avg4c: number | null;
    visitCount: number | null;
    lastVisitedAt: string | null;
    createdAt: string;
    profileId: string | null;
    status: "active" | "banned" | null;
    role: string | null;
    marketingAgree: boolean | null;
    locale: string | null;
    countryCode: string | null;
    platform: "ios" | "android" | null;
    simSessions: number | null;
    simMatches: number | null;
    lastSeenAt: string | null;
    activeDays7: number | null;
    avgSessionMin30: number | null;
};

export const ADMIN_MEMBERS_KEY = ["/api/hiq/admin/members"] as const;
/** 회원 한 명의 골프 칸 — ADMIN_MEMBERS_KEY 로 시작하므로 회원 목록을 무효화하면 함께 새로 받는다 */
export const memberGolfKey = (id: string) => ["/api/hiq/admin/members", id, "golf"] as const;

type Form ={ name: string; gender: "" | "male" | "female"; birthYear: string; handi3c: string; handi4c: string };

function toForm(m: AdminMember): Form {
    return {
        name: m.name ?? "",
        gender: m.gender ?? "",
        birthYear: m.birthYear ? String(m.birthYear) : "",
        handi3c: m.handi3c != null ? String(m.handi3c) : "",
        handi4c: m.handi4c != null ? String(m.handi4c) : "",
    };
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl bg-black/[0.03] px-3 py-2.5">
            <p className="text-[11px] font-bold text-black/45">{label}</p>
            <div className="mt-0.5 text-[15px] font-bold text-[rgba(0,0,0,0.87)] tabular-nums">{children}</div>
        </div>
    );
}

// --- 골프 칸(2026-10-01) ---

/** 한국 날짜 "9/28" — 올해가 아니면 "25.9/28" */
function kstMonthDay(iso: string | null | undefined): string {
    if (!iso) return "-";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "-";
    const k = new Date(t + 9 * 3600_000);
    const md = `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
    const thisYear = new Date(Date.now() + 9 * 3600_000).getUTCFullYear();
    return k.getUTCFullYear() === thisYear ? md : `${String(k.getUTCFullYear()).slice(2)}.${md}`;
}

/** 라운드 한 건의 현장 인증 — true 인증 · false 미인증 · null 규칙(9/30) 전 옛 기록(인증으로 센다) */
function OnSitePill({ v }: { v: boolean | null }) {
    if (v === true) return <Pill tone="brand">인증</Pill>;
    if (v === false) return <Pill tone="warn">미인증</Pill>;
    return <Pill tone="neutral">옛 기록</Pill>;
}

/** 평판 숫자 한 칸 */
function Count({ label, value, tone }: { label: string; value: number; tone?: "alert" | "warn" }) {
    const color = tone === "alert" ? "text-red-600" : tone === "warn" ? "text-amber-700" : "text-[rgba(0,0,0,0.87)]";
    return (
        <div className="rounded-xl bg-black/[0.03] px-1 py-2 text-center">
            <p className="text-[11px] font-bold text-black/45">{label}</p>
            <p className={`mt-0.5 text-[17px] leading-tight font-black tabular-nums ${color}`}>{value}</p>
        </div>
    );
}

function GolfSection({ golf, isLoading, isError, onRetry }: { golf: AdminMemberGolf | undefined; isLoading: boolean; isError: boolean; onRetry: () => void }) {
    const heading = <h3 className="text-[12px] font-black text-black/45 mb-2">골프</h3>;
    if (isLoading) {
        return <section>{heading}<div className="rounded-2xl bg-white border border-black/[0.07] px-4 py-6 text-center text-[13px] text-black/40">불러오는 중…</div></section>;
    }
    if (isError || !golf) {
        return (
            <section>
                {heading}
                <div className="rounded-2xl bg-white border border-black/[0.07] px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-[13px] text-black/50">골프 정보를 불러오지 못했습니다.</p>
                    <button onClick={onRetry} className="shrink-0 h-9 px-3 rounded-lg border border-black/10 text-[13px] font-bold text-black/65">다시 불러오기</button>
                </div>
            </section>
        );
    }
    const { stats, onSite, rounds, reputation: rep, posts } = golf;
    const nothing = onSite.total === 0 && rep.applications === 0 && posts.joins + posts.bookings === 0 && !stats.grade && stats.handicap == null;
    if (nothing) {
        return <section>{heading}<p className="rounded-2xl bg-white border border-black/[0.07] px-4 py-3.5 text-[13px] text-black/45">골프 기록·신청·올린 글이 없습니다.</p></section>;
    }
    const pct = (n: number) => (onSite.total ? (n / onSite.total) * 100 : 0);
    return (
        <section>
            {heading}
            <div className="grid grid-cols-3 gap-2">
                <Stat label="등급"><span className="block truncate text-[13.5px]" title={stats.grade ?? undefined}>{stats.grade ?? "-"}</span></Stat>
                <Stat label="공식 평균">{stats.avgScore != null ? `${stats.avgScore.toFixed(1)}타` : "-"}</Stat>
                <Stat label="베스트">{stats.bestScore != null ? `${stats.bestScore}타` : "-"}</Stat>
                <Stat label="공식 라운드">{stats.officialRounds}회</Stat>
                <Stat label="핸디">{stats.handicap ?? "-"}</Stat>
                <Stat label="마지막 라운드"><span className="text-[13px]">{kstDate(stats.lastRoundAt)}</span></Stat>
            </div>
            {stats.storedRounds !== stats.officialRounds && (
                <p className="mt-1.5 text-[11.5px] break-keep text-amber-700">저장된 공식 라운드는 {stats.storedRounds}회입니다 — 기록과 달라 평균·등급이 옛 값일 수 있습니다.</p>
            )}

            <div className="mt-2 rounded-2xl bg-white border border-black/[0.07] p-4">
                <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[12px] font-bold text-black/50">현장 인증</p>
                    <p className="text-[12px] text-black/45 tabular-nums">골프 기록 {onSite.total}건</p>
                </div>
                {onSite.total > 0 ? (
                    <>
                        <div className="mt-2 h-2 rounded-full bg-black/[0.06] overflow-hidden flex" role="img"
                            aria-label={`인증 ${onSite.verified}건, 옛 기록 ${onSite.legacy}건, 미인증 ${onSite.unverified}건`}>
                            <span className="h-full bg-brand" style={{ width: `${pct(onSite.verified)}%` }} />
                            <span className="h-full bg-black/25" style={{ width: `${pct(onSite.legacy)}%` }} />
                            <span className="h-full bg-amber-400" style={{ width: `${pct(onSite.unverified)}%` }} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-black/60 tabular-nums">
                            <span className="inline-flex items-center gap-1"><span aria-hidden className="w-2 h-2 rounded-full bg-brand" />인증 {onSite.verified}</span>
                            <span className="inline-flex items-center gap-1"><span aria-hidden className="w-2 h-2 rounded-full bg-black/25" />옛 기록 {onSite.legacy}</span>
                            <span className="inline-flex items-center gap-1"><span aria-hidden className="w-2 h-2 rounded-full bg-amber-400" />미인증 {onSite.unverified}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug break-keep text-black/40">공식 = 인증 + 옛 기록(9/30 규칙 전). 미인증 라운드는 점수만 남고 평균·등급에는 들어가지 않습니다.</p>
                        <ul className="mt-3 border-t border-black/[0.06] divide-y divide-black/[0.05]">
                            {rounds.map((r) => (
                                <li key={r.id} className="flex items-center gap-2.5 py-2">
                                    <span className="w-10 shrink-0 text-[12px] text-black/45 tabular-nums">{kstMonthDay(r.playedAt)}</span>
                                    <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-[rgba(0,0,0,0.87)]">
                                        {r.course ?? "골프장 미상"}{r.subType ? <span className="font-normal text-black/40"> · {r.subType}</span> : null}
                                    </span>
                                    <span className="shrink-0 text-[14px] font-black tabular-nums">{r.score > 0 ? r.score : "-"}</span>
                                    {/* 알약 폭이 글자마다 달라 점수 줄이 들쭉날쭉해진다 — 자리를 고정한다 */}
                                    <span className="w-[3.25rem] shrink-0 flex justify-end"><OnSitePill v={r.onSite} /></span>
                                </li>
                            ))}
                        </ul>
                        {onSite.total > rounds.length && <p className="pt-1 text-[11px] text-black/35">최근 {rounds.length}건만 보입니다.</p>}
                    </>
                ) : (
                    <p className="mt-1.5 text-[12.5px] text-black/40">골프 라운드 기록이 없습니다.</p>
                )}
            </div>

            <div className="mt-2 rounded-2xl bg-white border border-black/[0.07] p-4">
                <p className="text-[12px] font-bold text-black/50">조인·부킹 신청 평판</p>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                    <Count label="신청" value={rep.applications} />
                    <Count label="승인" value={rep.accepted} />
                    <Count label="취소" value={rep.cancels} tone={rep.cancels >= 3 ? "warn" : undefined} />
                    <Count label="노쇼" value={rep.noShows} tone={rep.noShows > 0 ? "alert" : undefined} />
                </div>
                <p className="mt-2 text-[12px] text-black/50 tabular-nums">
                    대기 {rep.pending} · 거절 {rep.rejected}{rep.lastAppliedAt ? ` · 마지막 신청 ${kstDate(rep.lastAppliedAt)}` : ""}
                </p>
                <p className="mt-1 text-[11px] leading-snug break-keep text-black/40">
                    승인은 호스트가 받아 준 신청(노쇼 포함). 취소·노쇼는 다시 신청해도 줄지 않는 누적 횟수입니다. 글이 지워지면 그 글의 신청 기록도 함께 지워집니다.
                </p>

                <div className="mt-3 pt-3 border-t border-black/[0.06]">
                    <p className="text-[12px] font-bold text-black/50">올린 글</p>
                    <p className="mt-1 text-[13px] text-[rgba(0,0,0,0.87)] tabular-nums">
                        조인 <b>{posts.joins}</b> · 부킹 <b>{posts.bookings}</b>
                        {posts.personalBookings > 0 && <span className="text-black/45"> (개인 양도 {posts.personalBookings})</span>}
                        <span className="text-black/50"> · 다가오는 글 {posts.upcoming}</span>
                        {posts.blinded > 0 && <span className="text-red-600"> · 가려짐 {posts.blinded}</span>}
                    </p>
                    {posts.lastPostedAt && <p className="mt-0.5 text-[11.5px] text-black/40">마지막 글 {kstDate(posts.lastPostedAt)}</p>}
                </div>
            </div>
        </section>
    );
}

/** 부킹매니저 줄 아래 설명 — 지금 상태에서 무엇이 되는지 */
function managerNote(s: BookingManagerState, role: string | null): string {
    switch (s.kind) {
        case "manager": return "부킹을 매장 글로 올립니다 — 번호 공개 · 시간당 400건 · 핫딜 리본";
        case "user": return "켜면 부킹이 매장 글로 올라갑니다(번호 공개 · 시간당 400건 · 핫딜 리본)";
        case "store_owner": return "매장 사장님 계정이라 이미 매장 글로 올립니다";
        case "staff": return "관리자 계정이라 이미 매장 글로 올립니다";
        case "no_account": return "로그인 계정이 없어 바꿀 수 없습니다";
        default: return `역할(${role ?? "-"})이 달라 여기서 바꾸지 않습니다`;
    }
}

export default function MemberDetailSheet({ member, onClose }: { member: AdminMember | null; onClose: () => void }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [form, setForm] = useState<Form | null>(null);
    const [gamesFor, setGamesFor] = useState<{ id: string; name: string } | null>(null);
    const [pinResult, setPinResult] = useState<{ pin: string; name: string; phone: string } | null>(null);
    const [pushOpen, setPushOpen] = useState(false);
    const [push, setPush] = useState({ title: "", body: "" });

    useEffect(() => {
        setForm(member ? toForm(member) : null);
        setPushOpen(false);
        setPush({ title: "", body: "" });
    }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_MEMBERS_KEY });

    const save = useMutation({
        mutationFn: async () => {
            if (!member || !form) return;
            const body: Record<string, unknown> = {};
            const orig = toForm(member);
            if (form.name.trim() !== orig.name) body.name = form.name.trim();
            if (form.gender !== orig.gender) body.gender = form.gender || null;
            if (form.birthYear !== orig.birthYear) body.birthYear = form.birthYear ? Number(form.birthYear) : null;
            if (form.handi3c !== orig.handi3c) body.handi3c = form.handi3c ? Number(form.handi3c) : null;
            if (form.handi4c !== orig.handi4c) body.handi4c = form.handi4c ? Number(form.handi4c) : null;
            return apiRequest(`/api/hiq/admin/members/${member.id}`, { method: "PATCH", body });
        },
        onSuccess: () => {
            toast({ title: "회원 정보를 저장했습니다" });
            refresh();
            queryClient.invalidateQueries({ queryKey: TODAY_ACTIVE_KEY });
        },
        onError: (e: any) => toast({ title: e?.message || "저장 실패", variant: "destructive" }),
    });

    const resetPin = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/members/${id}/reset-pin`, { method: "POST" }) as Promise<{ pin: string; name: string; phone: string }>,
        onSuccess: (r) => setPinResult(r),
        onError: (e: any) => toast({ title: "PIN 초기화 실패", description: e?.message ?? "", variant: "destructive" }),
    });

    const setStatus = useMutation({
        mutationFn: async (banned: boolean) => apiRequest(`/api/hiq/admin/members/${member!.id}/status`, { method: "POST", body: { banned } }),
        onSuccess: (_r, banned) => {
            toast({ title: banned ? "계정을 정지했습니다" : "정지를 풀었습니다" });
            refresh();
        },
        onError: (e: any) => toast({ title: e?.message || "처리 실패", variant: "destructive" }),
    });

    const sendPush = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/admin/push", {
            method: "POST",
            body: { memberIds: [member!.id], title: push.title.trim(), body: push.body.trim() },
        }),
        onSuccess: () => {
            toast({ title: `${member?.name}님에게 알림을 보냈습니다` });
            setPushOpen(false);
            setPush({ title: "", body: "" });
        },
        onError: (e: any) => toast({ title: e?.message || "발송 실패", variant: "destructive" }),
    });

    // 골프 칸 — 시트를 열 때만 받는다. 노쇼·취소 이력이 실려 있어 닫으면 캐시에서 바로 지운다(gcTime 0).
    const golfQ = useQuery<AdminMemberGolf>({ queryKey: memberGolfKey(member?.id ?? ""), enabled: !!member, gcTime: 0 });

    const toggleManager = useMutation({
        mutationFn: async (on: boolean) =>
            apiRequest(`/api/hiq/admin/members/${member!.id}/booking-manager`, { method: "POST", body: { on } }) as Promise<{ role: string; changed: boolean }>,
        onSuccess: (r, on) => {
            toast({ title: !r?.changed ? "이미 그렇게 되어 있습니다" : on ? "부킹매니저로 지정했습니다" : "부킹매니저 지정을 풀었습니다" });
            refresh();
        },
        onError: (e: any) => {
            toast({ title: "부킹매니저 변경 실패", description: e?.message ?? "", variant: "destructive" });
            refresh();
        },
    });

    const m = member;
    // 메시지(2026-10-06 오너: "관리자는 누구와도 다 채팅을 할 수 있게") — 이 회원의 문의 방(/chat/support/<id>)을 연다.
    // 운영자 개인 1:1 이 아니다: 회원에게는 '랭큐 운영팀'으로 보이고 다른 운영자도 이어받는다. 탈퇴회원에게는 단추를 숨긴다(받을 사람이 없다).
    const { t } = useT();
    const [, setLocation] = useLocation();
    const [chatOpening, setChatOpening] = useState(false);
    const canMessage = !!m && !isWithdrawnMember(m);
    const openChat = async () => {
        if (!m || chatOpening) return;
        setChatOpening(true);
        try {
            // 어드민 콘솔은 파트너 쿠키로, 채팅은 회원 쿠키로 들어온다 — 이 브라우저에 운영자 회원 로그인이 없으면 방이 열리지 않는다.
            // 가기 전에 방 정보를 한 번 물어 본다: 열리면 그대로 가고, 안 열리면 왜인지 여기서 알린다(끝없이 도는 빈 방으로 보내지 않는다).
            await apiRequest(`/api/hiq/chat/rooms/support:${m.id}/info`);
            onClose();
            setLocation(`/chat/support/${m.id}`);
        } catch (e: any) {
            void appAlert(e?.status === 401 || e?.status === 403 ? t("chat.adminNeedAppLogin") : e?.message || t("chat.dmFailed"));
        } finally {
            setChatOpening(false);
        }
    };
    const dirty = !!(m && form && JSON.stringify(form) !== JSON.stringify(toForm(m)));
    const banned = m?.status === "banned";
    // 역할은 방금 받은 골프 칸 값을 먼저 본다 — 회원 목록은 기기에 저장된 캐시라 늦을 수 있다
    const role = golfQ.data ? golfQ.data.role : m?.role ?? null;
    const isStaff = role === "admin" || role === "super_admin";
    const manager = bookingManagerState(m?.profileId ? role : null);

    const onToggleManager = async (on: boolean) => {
        if (!m) return;
        const message = on
            ? `${m.name}님을 골프 부킹매니저로 지정할까요?\n\n앞으로 올리는 부킹이 매장 글이 됩니다.\n· '개인 양도' 표시 없이 매장 글로 보입니다\n· 휴대폰 번호가 모두에게 보입니다(문의 버튼)\n· 한 시간에 400건까지 올립니다(개인은 40건)\n· '긴급 핫딜' 리본을 달 수 있습니다\n\n이미 올린 글은 그대로입니다.`
            : `${m.name}님의 골프 부킹매니저 지정을 풀까요?\n\n앞으로 올리는 부킹은 개인 양도 글이 됩니다 — 번호는 확정된 신청자에게만 보이고, 한 시간 40건, 핫딜 리본은 꺼집니다.\n\n이미 올린 글은 그대로입니다.`;
        if (!(await appConfirm({ title: on ? "부킹매니저 지정" : "부킹매니저 해제", message, tone: on ? "danger" : "default", confirmText: on ? "지정" : "풀기" }))) return;
        toggleManager.mutate(on);
    };

    return (
        <>
            <Sheet open={!!m} onOpenChange={(o) => { if (!o) onClose(); }}>
                <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-surface-0">
                    {m && form && (
                        <>
                            <div className="shrink-0 bg-white border-b border-black/[0.07] px-5 pt-6 pb-4">
                                <div className="flex items-center gap-3 pr-8">
                                    <div className="w-12 h-12 shrink-0 rounded-full bg-brand/10 flex items-center justify-center text-[18px] font-black text-brand">
                                        {m.name?.slice(0, 1) || "?"}
                                    </div>
                                    <div className="min-w-0">
                                        <SheetTitle className="flex items-center gap-1.5 text-[18px] font-black text-[rgba(0,0,0,0.87)]">
                                            <span className="truncate">{m.name}</span>
                                            {banned && <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-600">정지됨</span>}
                                            {isStaff && <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-bold text-black/60">관리자</span>}
                                            {role === "store_owner" && <span className="shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-bold text-black/60">사장님</span>}
                                            {role === "booking_manager" && <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-bold text-blue-700">부킹매니저</span>}
                                            {isKstToday(m.createdAt) && <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">오늘 가입</span>}
                                        </SheetTitle>
                                        <SheetDescription className="text-[13px] text-black/50 tabular-nums flex items-center gap-1.5">
                                            {phoneLabel(m.phone)} · <PlatformIcon platform={m.platform} /> <CountryFlag code={m.countryCode} />
                                        </SheetDescription>
                                    </div>
                                </div>
                                {(isRealPhone(m.phone) || canMessage) && (
                                    <div className="mt-3 flex gap-2">
                                        {isRealPhone(m.phone) && (
                                            <>
                                                <a href={`tel:${m.phone}`} className="flex-1 h-9 rounded-lg border border-black/10 flex items-center justify-center gap-1.5 text-[13px] font-bold text-black/65">
                                                    <LucidePhone className="w-3.5 h-3.5" /> 전화
                                                </a>
                                                <a href={`sms:${m.phone}`} className="flex-1 h-9 rounded-lg border border-black/10 flex items-center justify-center text-[13px] font-bold text-black/65">
                                                    문자
                                                </a>
                                            </>
                                        )}
                                        {/* 앱 안 채팅 — 이 회원의 문의 방. 소셜 가입(전화 없음) 회원에게도 보인다. 탈퇴회원에게는 없다. */}
                                        {canMessage && (
                                            <button type="button" disabled={chatOpening} onClick={() => void openChat()}
                                                className="flex-1 h-9 rounded-lg border border-brand/30 bg-brand/[0.06] flex items-center justify-center gap-1.5 text-[13px] font-bold text-brand disabled:opacity-50">
                                                <LucideMessageCircle className="w-3.5 h-3.5" /> {t("chat.adminMessageShort")}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
                                <section>
                                    <h3 className="text-[12px] font-black text-black/45 mb-2">활동</h3>
                                    <div className="grid grid-cols-3 gap-2">
                                        <Stat label="마지막 접속"><span className={lastSeenTone(m.lastSeenAt)}>{lastSeenLabel(m.lastSeenAt)}</span></Stat>
                                        <Stat label="7일 접속">{m.activeDays7 ? `${m.activeDays7}일` : "-"}</Stat>
                                        <Stat label="평균 세션">{m.avgSessionMin30 ? `${m.avgSessionMin30}분` : "-"}</Stat>
                                        <Stat label="3쿠션 RP"><span className="text-brand">{m.rating3c ?? 0}</span></Stat>
                                        <Stat label="4구 RP"><span className="text-brand">{m.rating4c ?? 0}</span></Stat>
                                        <Stat label="방문">{m.visitCount ?? 0}회</Stat>
                                        <Stat label="온라인 연습">{m.simSessions ?? 0}</Stat>
                                        <Stat label="온라인 대전">{m.simMatches ?? 0}</Stat>
                                        <Stat label="가입일"><span className="text-[13px]">{kstDate(m.createdAt)}</span></Stat>
                                    </div>
                                    <p className="mt-2 text-[12px] text-black/45">
                                        가입 경로: {m.storeName ?? "-"}{m.marketingAgree ? " · 마케팅 수신 동의" : ""}
                                    </p>
                                </section>

                                <GolfSection golf={golfQ.data} isLoading={golfQ.isLoading} isError={golfQ.isError} onRetry={() => void golfQ.refetch()} />

                                <section>
                                    <h3 className="text-[12px] font-black text-black/45 mb-2">정보 수정</h3>
                                    <div className="space-y-2.5 rounded-2xl bg-white border border-black/[0.07] p-4">
                                        <label className="block">
                                            <span className="text-[12px] font-bold text-black/50">이름</span>
                                            <Input value={form.name} maxLength={30} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-10" />
                                        </label>
                                        <div>
                                            <span className="text-[12px] font-bold text-black/50">성별</span>
                                            <div className="mt-1 grid grid-cols-3 gap-1.5">
                                                {([["male", "남"], ["female", "여"], ["", "미입력"]] as const).map(([v, label]) => (
                                                    <button key={v || "none"} type="button" onClick={() => setForm({ ...form, gender: v })}
                                                        className={`h-9 rounded-lg text-[13px] font-bold ${form.gender === v ? "bg-brand text-white" : "bg-black/[0.05] text-black/55"}`}>
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <label className="block">
                                                <span className="text-[12px] font-bold text-black/50">출생연도</span>
                                                <Input inputMode="numeric" value={form.birthYear} placeholder="1985" onChange={(e) => setForm({ ...form, birthYear: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="mt-1 h-10 tabular-nums" />
                                            </label>
                                            <label className="block">
                                                <span className="text-[12px] font-bold text-black/50">3쿠션 핸디</span>
                                                <Input inputMode="numeric" value={form.handi3c} onChange={(e) => setForm({ ...form, handi3c: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="mt-1 h-10 tabular-nums" />
                                            </label>
                                            <label className="block">
                                                <span className="text-[12px] font-bold text-black/50">4구 핸디</span>
                                                <Input inputMode="numeric" value={form.handi4c} onChange={(e) => setForm({ ...form, handi4c: e.target.value.replace(/\D/g, "").slice(0, 4) })} className="mt-1 h-10 tabular-nums" />
                                            </label>
                                        </div>
                                        <p className="text-[11.5px] text-black/40">전화번호는 로그인 정보라 여기서 바꾸지 않습니다. RP 는 경기 기록으로 계산됩니다 — 잘못된 경기는 '경기 기록 정리'에서 지우세요.</p>
                                        <div className="flex gap-2 pt-1">
                                            <Button variant="ghost" className="flex-1 h-10" disabled={!dirty || save.isPending} onClick={() => setForm(toForm(m))}>되돌리기</Button>
                                            <Button className="flex-1 h-10 bg-brand hover:bg-brand-strong text-white font-bold" disabled={!dirty || !form.name.trim() || save.isPending} onClick={() => save.mutate()}>
                                                <LucideSave className="w-4 h-4 mr-1.5" />{save.isPending ? "저장 중…" : "저장"}
                                            </Button>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-[12px] font-black text-black/45 mb-2">관리</h3>
                                    <div className="rounded-2xl bg-white border border-black/[0.07] divide-y divide-black/[0.05] overflow-hidden">
                                        <button onClick={() => setGamesFor({ id: m.id, name: m.name })} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-black/[0.02]">
                                            <LucideHistory className="w-4 h-4 text-black/50" />
                                            <span className="flex-1 text-[14px] font-bold">경기 기록 정리</span>
                                        </button>
                                        <div>
                                            <button onClick={() => setPushOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-black/[0.02]">
                                                <LucideBell className="w-4 h-4 text-black/50" />
                                                <span className="flex-1 text-[14px] font-bold">이 회원에게 알림 보내기</span>
                                            </button>
                                            {pushOpen && (
                                                <div className="px-4 pb-4 space-y-2">
                                                    <Input value={push.title} maxLength={60} placeholder="제목" onChange={(e) => setPush({ ...push, title: e.target.value })} className="h-10" />
                                                    <Textarea value={push.body} maxLength={200} placeholder="내용 (200자 이내)" onChange={(e) => setPush({ ...push, body: e.target.value })} className="h-20 text-sm" />
                                                    <Button className="w-full h-10 bg-brand hover:bg-brand-strong text-white font-bold"
                                                        disabled={!push.title.trim() || !push.body.trim() || sendPush.isPending} onClick={() => sendPush.mutate()}>
                                                        {sendPush.isPending ? "보내는 중…" : "보내기"}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        {m.profileId && (
                                            <div className="flex items-start gap-3 px-4 py-3.5">
                                                <LucideStore className="mt-0.5 w-4 h-4 shrink-0 text-black/50" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[14px] font-bold">골프 부킹매니저</p>
                                                    <p className="mt-0.5 text-[12px] leading-snug break-keep text-black/45">
                                                        {managerNote(manager, role)}
                                                        {/* 부킹은 문자 문의 버튼 때문에 휴대폰 번호가 있어야 올라간다(golf.ts NO_CONTACT_PHONE) — 켜기 전에 알아야 한다 */}
                                                        {(manager.isStoreSeller || manager.canToggle) && !isRealPhone(m.phone) && <span className="text-amber-700"> · 휴대폰 번호가 없어 부킹은 못 올립니다(조인만)</span>}
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={manager.isStoreSeller}
                                                    disabled={!manager.canToggle || toggleManager.isPending || golfQ.isFetching}
                                                    onCheckedChange={(v) => void onToggleManager(v)}
                                                    aria-label="골프 부킹매니저"
                                                    className="mt-0.5 data-[state=checked]:bg-brand data-[state=unchecked]:bg-black/15"
                                                />
                                            </div>
                                        )}
                                        {isRealPhone(m.phone) && (
                                            <button
                                                disabled={resetPin.isPending}
                                                onClick={() => {
                                                    void appConfirm({ message: `${m.name}(${m.phone}) 님의 PIN 을 임시 PIN 으로 바꿉니다.\n본인 확인을 마쳤나요? 지금 PIN 은 더 이상 쓸 수 없습니다.`, tone: "danger", confirmText: "초기화" }).then((ok) => { if (ok) resetPin.mutate(m.id); });
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-black/[0.02] disabled:opacity-50"
                                            >
                                                <LucideKeyRound className="w-4 h-4 text-black/50" />
                                                <span className="flex-1 text-[14px] font-bold">PIN 초기화</span>
                                                <span className="text-[12px] text-black/40">임시 PIN 발급</span>
                                            </button>
                                        )}
                                        {m.profileId && !isStaff && (
                                            <button
                                                disabled={setStatus.isPending}
                                                onClick={() => {
                                                    const msg = banned ? `${m.name}님의 정지를 풀까요?` : `${m.name}님의 계정을 정지할까요?\n정지되면 로그인과 활동이 막힙니다.`;
                                                    void appConfirm({ message: msg, tone: banned ? "default" : "danger", confirmText: banned ? "정지 풀기" : "정지" }).then((ok) => { if (ok) setStatus.mutate(!banned); });
                                                }}
                                                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50 ${banned ? "hover:bg-brand/[0.04]" : "hover:bg-red-500/[0.04]"}`}
                                            >
                                                <LucideShieldAlert className={`w-4 h-4 ${banned ? "text-brand" : "text-red-500"}`} />
                                                <span className={`flex-1 text-[14px] font-bold ${banned ? "text-brand" : "text-red-600"}`}>{banned ? "정지 해제" : "계정 정지"}</span>
                                            </button>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            <MemberGamesDialog member={gamesFor} onClose={() => setGamesFor(null)} />
            <Dialog open={pinResult !== null} onOpenChange={(o) => { if (!o) setPinResult(null); }}>
                <DialogContent className="max-w-sm">
                    <h2 className="text-lg font-black text-[rgba(0,0,0,0.87)]">임시 PIN 발급 완료</h2>
                    <p className="text-sm text-black/60">{pinResult?.name} · {pinResult?.phone}</p>
                    <p className="my-2 text-center font-mono text-4xl font-black tracking-[0.3em] text-brand">{pinResult?.pin}</p>
                    <p className="text-xs text-black/50 leading-relaxed">
                        이 창을 닫으면 다시 볼 수 없습니다. 사용자에게 전달하세요 — 전화번호 + 이 PIN 으로 로그인하면 기존 기록이 그대로 있습니다.
                        PIN 을 바꾸고 싶으면 로그인 화면의 "PIN을 잊으셨나요?"(보안 질문)로 바꿀 수 있습니다.
                    </p>
                </DialogContent>
            </Dialog>
        </>
    );
}
