/**
 * 어드민 · 푸시 발송(2026-09-26 정리).
 *  - 받는 사람: 전체 · 묶음(오늘 접속 · 7일 활동 · 30일+ 이탈 · 7일 신규 · 앱 설치) · 개별 선택(검색)
 *  - 미리보기: 폰 알림 모양으로 제목·내용이 어떻게 보일지
 *  - 보내기 전에 인원을 확인받는다(전체 발송은 되돌릴 수 없다).
 *  - 최근 발송: 받은 사람·읽은 사람(열어 본 비율) — GET /admin/push/history
 * 서버는 한 번에 500명까지 받는다(POST /admin/push) — 묶음이 더 크면 500명씩 나눠 보낸다.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type AdminMember, ADMIN_MEMBERS_KEY } from "./MemberDetailSheet";
import { FilterChips, SearchBox, Panel, Pill, EmptyState, daysSince, isKstToday, kstDateTime, phoneLabel } from "./adminUtils";

type Audience = "all" | "today" | "active7" | "dormant" | "new7" | "app" | "pick";
const AUDIENCE: { id: Audience; label: string; test?: (m: AdminMember) => boolean }[] = [
    { id: "all", label: "전체" },
    { id: "today", label: "오늘 접속", test: (m) => isKstToday(m.lastSeenAt) },
    { id: "active7", label: "7일 활동", test: (m) => daysSince(m.lastSeenAt) <= 7 },
    { id: "dormant", label: "30일+ 이탈", test: (m) => daysSince(m.lastSeenAt) > 30 },
    { id: "new7", label: "7일 신규", test: (m) => daysSince(m.createdAt) <= 7 },
    { id: "app", label: "앱 설치", test: (m) => m.platform === "ios" || m.platform === "android" },
    { id: "pick", label: "직접 고르기" },
];

// 누르면 열 화면 — 자주 쓰는 곳
const URL_PRESETS: { label: string; url: string }[] = [
    { label: "없음", url: "" },
    { label: "온라인게임", url: "/online-game" },
    { label: "랭킹", url: "/ranking" },
    { label: "커뮤니티", url: "/community" },
    { label: "매장 찾기", url: "/stores" },
];

type PushHistory = { title: string; body: string; url: string | null; sentAt: string; recipients: number; readCount: number };
const HISTORY_KEY = ["/api/hiq/admin/push/history"] as const;
const CHUNK = 500;

export default function PushView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: members = [] } = useQuery<AdminMember[]>({ queryKey: ADMIN_MEMBERS_KEY });
    const { data: history = [], isLoading: historyLoading } = useQuery<PushHistory[]>({ queryKey: HISTORY_KEY });
    const [form, setForm] = useState({ title: "", body: "", url: "" });
    const [audience, setAudience] = useState<Audience>("all");
    const [picked, setPicked] = useState<string[]>([]);
    const [pickSearch, setPickSearch] = useState("");
    const [sending, setSending] = useState<{ done: number; total: number } | null>(null);

    const counts = useMemo(() => Object.fromEntries(AUDIENCE.map((a) => [a.id,
        a.id === "all" ? members.length : a.id === "pick" ? picked.length : members.filter(a.test!).length])) as Record<Audience, number>, [members, picked]);

    const targets: string[] | "all" = useMemo(() => {
        if (audience === "all") return "all";
        if (audience === "pick") return picked;
        const a = AUDIENCE.find((x) => x.id === audience)!;
        return members.filter(a.test!).map((m) => m.id);
    }, [audience, picked, members]);
    const targetCount = targets === "all" ? members.length : targets.length;

    const pickList = useMemo(() => {
        const s = pickSearch.trim();
        const list = s ? members.filter((m) => m.name?.includes(s) || m.phone?.includes(s)) : members;
        return list.slice(0, 200);
    }, [members, pickSearch]);

    const canSend = !!form.title.trim() && !!form.body.trim() && targetCount > 0 && !sending;

    const send = async () => {
        const label = AUDIENCE.find((a) => a.id === audience)!.label;
        if (!window.confirm(`'${label}' ${targetCount.toLocaleString()}명에게 알림을 보냅니다.\n\n${form.title}\n${form.body}\n\n보낸 알림은 되돌릴 수 없습니다.`)) return;
        const payload = { title: form.title.trim(), body: form.body.trim(), url: form.url.trim() || undefined };
        try {
            let sent = 0, total = 0;
            if (targets === "all") {
                setSending({ done: 0, total: members.length });
                const r: any = await apiRequest("/api/hiq/admin/push", { method: "POST", body: { ...payload, memberIds: "all" } });
                sent = r.sent; total = r.total;
            } else {
                setSending({ done: 0, total: targets.length });
                for (let i = 0; i < targets.length; i += CHUNK) {
                    const r: any = await apiRequest("/api/hiq/admin/push", { method: "POST", body: { ...payload, memberIds: targets.slice(i, i + CHUNK) } });
                    sent += r.sent; total += r.total;
                    setSending({ done: Math.min(targets.length, i + CHUNK), total: targets.length });
                }
            }
            toast({ title: `발송 완료 — ${sent.toLocaleString()}/${total.toLocaleString()}명` });
            setForm({ title: "", body: "", url: "" });
            setPicked([]);
            qc.invalidateQueries({ queryKey: HISTORY_KEY });
        } catch (e: any) {
            toast({ title: e?.message || "발송 실패", description: "일부만 나갔을 수 있습니다 — 최근 발송에서 인원을 확인하세요.", variant: "destructive" });
            qc.invalidateQueries({ queryKey: HISTORY_KEY });
        } finally {
            setSending(null);
        }
    };

    return (
        <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
            <div className="space-y-4">
                <Panel className="p-4 space-y-3">
                    <h3 className="font-bold text-[15px]">1. 받는 사람</h3>
                    <FilterChips value={audience} onChange={setAudience} options={AUDIENCE.map((a) => ({ id: a.id, label: a.label, count: counts[a.id] }))} />
                    {audience === "pick" && (
                        <div className="space-y-2">
                            <SearchBox value={pickSearch} onChange={setPickSearch} placeholder="이름·전화번호로 찾기" />
                            <div className="max-h-64 overflow-y-auto rounded-xl border border-black/[0.06] divide-y divide-black/[0.05]">
                                {pickList.map((m) => (
                                    <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-black/[0.02]">
                                        <input type="checkbox" className="w-4 h-4 accent-[rgb(var(--brand))]" checked={picked.includes(m.id)}
                                            onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)))} />
                                        <span className="text-[14px] font-semibold">{m.name}</span>
                                        <span className="text-[12px] text-black/40 tabular-nums">{phoneLabel(m.phone)}</span>
                                    </label>
                                ))}
                                {pickList.length === 0 && <p className="p-4 text-center text-[13px] text-black/40">찾는 회원이 없습니다.</p>}
                            </div>
                            {picked.length > 0 && (
                                <div className="flex items-center justify-between text-[12.5px]">
                                    <span className="text-black/55"><b className="text-brand tabular-nums">{picked.length}</b>명 골랐어요</span>
                                    <button onClick={() => setPicked([])} className="font-bold text-black/45 hover:text-red-600">모두 해제</button>
                                </div>
                            )}
                        </div>
                    )}
                    <p className="text-[12px] text-black/45">알림함에 저장되고, 앱을 설치하고 알림을 허용한 회원에게는 기기 알림도 갑니다.</p>
                </Panel>

                <Panel className="p-4 space-y-3">
                    <h3 className="font-bold text-[15px]">2. 내용</h3>
                    <div>
                        <Input value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="제목 (예: 이번 주 랭킹전 안내)" className="h-11" />
                        <p className="mt-1 text-right text-[11px] text-black/35 tabular-nums">{form.title.length}/60</p>
                    </div>
                    <div>
                        <Textarea value={form.body} maxLength={200} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="내용 (200자 이내)" className="h-24" />
                        <p className="mt-1 text-right text-[11px] text-black/35 tabular-nums">{form.body.length}/200</p>
                    </div>
                    <div>
                        <p className="text-[12px] font-bold text-black/50 mb-1.5">누르면 열 화면</p>
                        <div className="flex gap-1.5 flex-wrap mb-2">
                            {URL_PRESETS.map((p) => (
                                <button key={p.label} onClick={() => setForm({ ...form, url: p.url })}
                                    className={`h-8 px-3 rounded-full text-[12.5px] font-bold ${form.url === p.url ? "bg-black/80 text-white" : "bg-black/[0.05] text-black/55"}`}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <Input value={form.url} maxLength={200} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="직접 입력 (예: /online-game)" className="h-10 font-mono text-[13px]" />
                    </div>
                </Panel>

                <Button disabled={!canSend} onClick={send} className="w-full h-12 bg-brand hover:bg-brand-strong text-white font-bold text-[15px]">
                    {sending ? `보내는 중… ${sending.done.toLocaleString()}/${sending.total.toLocaleString()}` : `${targetCount.toLocaleString()}명에게 보내기`}
                </Button>
            </div>

            <div className="space-y-4 lg:sticky lg:top-6">
                {/* 폰 알림 미리보기 */}
                <div className="rounded-[1.75rem] bg-gradient-to-b from-[#2b3a35] to-[#1c2622] p-4 pt-6">
                    <p className="text-center text-white/70 text-[12px] mb-3 tabular-nums">미리보기</p>
                    <div className="rounded-2xl bg-white/90 backdrop-blur px-3.5 py-3 shadow-lg">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="w-5 h-5 rounded-md bg-brand flex items-center justify-center text-[10px] font-black text-white">R</span>
                            <span className="text-[11.5px] font-semibold text-black/55">랭큐</span>
                            <span className="ml-auto text-[11px] text-black/40">지금</span>
                        </div>
                        <p className="text-[14px] font-bold text-black/85 truncate">{form.title || "제목"}</p>
                        <p className="text-[13px] text-black/65 line-clamp-3 whitespace-pre-wrap">{form.body || "내용이 여기에 보입니다."}</p>
                    </div>
                </div>

                <Panel className="p-4">
                    <h3 className="font-bold text-[15px] mb-2">최근 발송 <span className="text-[12px] font-medium text-black/40">(90일)</span></h3>
                    {historyLoading ? <p className="text-[13px] text-black/40 py-4 text-center">불러오는 중…</p> : history.length === 0 ? (
                        <EmptyState>아직 보낸 알림이 없습니다.</EmptyState>
                    ) : (
                        <ul className="divide-y divide-black/[0.06]">
                            {history.map((h, i) => {
                                const rate = h.recipients ? Math.round((h.readCount / h.recipients) * 100) : 0;
                                return (
                                    <li key={`${h.sentAt}-${i}`} className="py-2.5">
                                        <div className="flex items-center gap-1.5">
                                            <p className="flex-1 min-w-0 text-[13.5px] font-bold truncate">{h.title}</p>
                                            <Pill tone={rate >= 30 ? "brand" : "neutral"}>읽음 {rate}%</Pill>
                                        </div>
                                        <p className="text-[12px] text-black/50 truncate">{h.body}</p>
                                        <p className="text-[11.5px] text-black/40 tabular-nums">
                                            {kstDateTime(h.sentAt)} · {h.recipients.toLocaleString()}명 중 {h.readCount.toLocaleString()}명 읽음{h.url ? ` · ${h.url}` : ""}
                                        </p>
                                        <button onClick={() => setForm({ title: h.title, body: h.body, url: h.url ?? "" })} className="mt-0.5 text-[11.5px] font-bold text-brand">이 내용 다시 쓰기</button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>
            </div>
        </div>
    );
}
