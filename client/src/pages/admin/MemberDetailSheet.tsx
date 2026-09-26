/**
 * 어드민 · 회원 상세(2026-09-26 오너: "회원관리 보기 어렵고 수정·변경이 가능하게").
 * 14칸짜리 가로 표 한 줄에 흩어져 있던 정보를 한 장에 모으고, 여기서 바로 고친다.
 *  - 정보 수정: 이름·성별·출생연도·핸디(서버 PATCH /admin/members/:id — 전화번호·RP 는 받지 않는다)
 *  - 조치: 경기 기록 정리 · 알림 보내기 · PIN 초기화 · 계정 정지/해제
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucidePhone, LucideBell, LucideHistory, LucideKeyRound, LucideShieldAlert, LucideSave } from "@/lib/icons";
import MemberGamesDialog from "./MemberGamesDialog";
import { PlatformIcon, CountryFlag, kstDate, lastSeenLabel, lastSeenTone, isRealPhone, phoneLabel, isKstToday } from "./adminUtils";
import { TODAY_ACTIVE_KEY } from "./TodayActiveView";

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

type Form = { name: string; gender: "" | "male" | "female"; birthYear: string; handi3c: string; handi4c: string };

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

    const m = member;
    const dirty = !!(m && form && JSON.stringify(form) !== JSON.stringify(toForm(m)));
    const banned = m?.status === "banned";
    const isStaff = m?.role === "admin" || m?.role === "super_admin";

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
                                            {isKstToday(m.createdAt) && <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">오늘 가입</span>}
                                        </SheetTitle>
                                        <SheetDescription className="text-[13px] text-black/50 tabular-nums flex items-center gap-1.5">
                                            {phoneLabel(m.phone)} · <PlatformIcon platform={m.platform} /> <CountryFlag code={m.countryCode} />
                                        </SheetDescription>
                                    </div>
                                </div>
                                {isRealPhone(m.phone) && (
                                    <div className="mt-3 flex gap-2">
                                        <a href={`tel:${m.phone}`} className="flex-1 h-9 rounded-lg border border-black/10 flex items-center justify-center gap-1.5 text-[13px] font-bold text-black/65">
                                            <LucidePhone className="w-3.5 h-3.5" /> 전화
                                        </a>
                                        <a href={`sms:${m.phone}`} className="flex-1 h-9 rounded-lg border border-black/10 flex items-center justify-center text-[13px] font-bold text-black/65">
                                            문자
                                        </a>
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
                                        {isRealPhone(m.phone) && (
                                            <button
                                                disabled={resetPin.isPending}
                                                onClick={() => {
                                                    if (window.confirm(`${m.name}(${m.phone}) 님의 PIN 을 임시 PIN 으로 바꿉니다.\n본인 확인을 마쳤나요? 지금 PIN 은 더 이상 쓸 수 없습니다.`)) resetPin.mutate(m.id);
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
                                                    if (window.confirm(msg)) setStatus.mutate(!banned);
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
