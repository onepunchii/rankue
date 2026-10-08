/**
 * 어드민 · 푸시 발송(2026-09-26 정리).
 *  - 받는 사람: 전체 · 묶음(오늘 접속 · 7일 활동 · 30일+ 이탈 · 7일 신규 · 앱 설치 · 골프 알림 받는 회원) · 개별 선택(검색)
 *  - 미리보기: 폰 알림 모양으로 제목·내용이 어떻게 보일지
 *  - 보내기 전에 인원을 확인받는다(전체 발송은 되돌릴 수 없다).
 *  - 최근 발송: 받은 사람·읽은 사람(열어 본 비율) — GET /admin/push/history
 * 서버는 한 번에 500명까지 받는다(POST /admin/push) — 묶음이 더 크면 500명씩 나눠 보낸다.
 *
 * 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자".
 *  - '골프 알림 받는 회원': 긴급 조인 방송과 같은 명단(골프 흔적 + 기기 알림 가능)이라 회원 목록으로는 못 센다 — 서버가 고른다
 *    (memberIds "golf", 인원은 GET /admin/push/golf-audience). 골프 알림함에 들어가도록 서버가 골프 알림으로 저장한다.
 *  - 조용한 시간(한국 21~08시)엔 골프 묶음이 기기를 울리지 않고 알림함에만 들어간다 — 긴급 조인과 같은 규칙. 그 시간엔 미리 경고한다.
 *  - 누르면 열 화면에 골프 주소(App.tsx 에 있는 것만 — /golf 라는 주소는 없다)를 더했다.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type AdminMember, ADMIN_MEMBERS_KEY } from "./MemberDetailSheet";
import { FilterChips, SearchBox, Panel, Pill, EmptyState, daysSince, isKstToday, kstDateTime, phoneLabel } from "./adminUtils";
import { appConfirm } from "@/components/AppDialog";
import { isGolfQuietHour, GOLF_PUSH_FROM_HOUR, GOLF_PUSH_UNTIL_HOUR } from "@shared/golfPushQuiet";

type Audience = "all" | "today" | "active7" | "dormant" | "new7" | "app" | "golf" | "pick";
const AUDIENCE: { id: Audience; label: string; test?: (m: AdminMember) => boolean }[] = [
    { id: "all", label: "전체" },
    { id: "today", label: "오늘 접속", test: (m) => isKstToday(m.lastSeenAt) },
    { id: "active7", label: "7일 활동", test: (m) => daysSince(m.lastSeenAt) <= 7 },
    { id: "dormant", label: "30일+ 이탈", test: (m) => daysSince(m.lastSeenAt) > 30 },
    { id: "new7", label: "7일 신규", test: (m) => daysSince(m.createdAt) <= 7 },
    { id: "app", label: "앱 설치", test: (m) => m.platform === "ios" || m.platform === "android" },
    // 서버가 고르는 묶음(목록에 골프 흔적이 없다) — test 가 없고 인원은 golf-audience 가 센다
    { id: "golf", label: "골프 알림 받는 회원" },
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
// 골프 — client/src/App.tsx 의 라우트와 맞춘 주소만. 조인·부킹·긴급·골프장은 GolfCourseHub, 내 예약은 하단 탭 화면.
const GOLF_URL_PRESETS: { label: string; url: string }[] = [
    { label: "조인", url: "/golf/join" },
    { label: "부킹", url: "/golf/booking" },
    { label: "긴급 조인", url: "/golf/urgent" },
    { label: "골프장", url: "/golf/courses" },
    { label: "내 예약", url: "/golf/my-bookings" },
];

type PushHistory = { title: string; body: string; url: string | null; sentAt: string; recipients: number; readCount: number; audience?: "golf" };
type GolfAudience = { count: number; capped: boolean; quiet: boolean };
const HISTORY_KEY = ["/api/hiq/admin/push/history"] as const;
export const GOLF_AUDIENCE_KEY = ["/api/hiq/admin/push/golf-audience"] as const;
const CHUNK = 500;
/** "밤 9시~아침 8시" — 숫자는 shared/golfPushQuiet 에서(긴급 조인과 같은 값) */
const GOLF_QUIET_LABEL = `밤 ${GOLF_PUSH_UNTIL_HOUR - 12}시~아침 ${GOLF_PUSH_FROM_HOUR}시`;

export default function PushView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const membersData = useQuery<AdminMember[]>({ queryKey: ADMIN_MEMBERS_KEY }).data;
    const historyQ = useQuery<PushHistory[]>({ queryKey: HISTORY_KEY });
    const { data: golfAudience } = useQuery<GolfAudience>({ queryKey: GOLF_AUDIENCE_KEY });
    // 응답이 배열이 아니면(세션 만료·옛 캐시) .filter 에서 화면 전체가 흰 화면이 된다 — 받는 자리에서 배열로
    const members = useMemo(() => (Array.isArray(membersData) ? membersData : []), [membersData]);
    const history = Array.isArray(historyQ.data) ? historyQ.data : [];
    const historyLoading = historyQ.isLoading;
    const [form, setForm] = useState({ title: "", body: "", url: "" });
    const [audience, setAudience] = useState<Audience>("all");
    const [picked, setPicked] = useState<string[]>([]);
    const [pickSearch, setPickSearch] = useState("");
    const [sending, setSending] = useState<{ done: number; total: number } | null>(null);

    // 조용한 시간 경고 — 화면을 켜 둔 채 9시를 넘겨도 바뀌게 1분마다 다시 본다. 실제 판정은 보낼 때 서버가 한다.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(t);
    }, []);
    const golfQuiet = isGolfQuietHour(now);
    const golfCount = typeof golfAudience?.count === "number" ? golfAudience.count : undefined;
    const inboxOnly = audience === "golf" && golfQuiet;

    const counts = useMemo(() => Object.fromEntries(AUDIENCE.map((a) => [a.id,
        a.id === "all" ? members.length
            : a.id === "pick" ? picked.length
                : a.id === "golf" ? golfCount
                    : members.filter(a.test!).length])) as Record<Audience, number | undefined>, [members, picked, golfCount]);

    // "all"·"golf" 는 서버가 명단을 고른다 — 화면은 묶음 이름만 보낸다
    const targets: string[] | "all" | "golf" = useMemo(() => {
        if (audience === "all") return "all";
        if (audience === "golf") return "golf";
        if (audience === "pick") return picked;
        const a = AUDIENCE.find((x) => x.id === audience)!;
        return members.filter(a.test!).map((m) => m.id);
    }, [audience, picked, members]);
    const targetCount = targets === "all" ? members.length : targets === "golf" ? golfCount ?? 0 : targets.length;

    const pickList = useMemo(() => {
        const s = pickSearch.trim();
        const list = s ? members.filter((m) => m.name?.includes(s) || m.phone?.includes(s)) : members;
        return list.slice(0, 200);
    }, [members, pickSearch]);

    const canSend = !!form.title.trim() && !!form.body.trim() && targetCount > 0 && !sending;

    const send = async () => {
        const label = AUDIENCE.find((a) => a.id === audience)!.label;
        const quietNote = targets === "golf" && isGolfQuietHour(Date.now())
            ? `\n\n지금은 골프 알림 조용한 시간이라 기기 알림 없이 알림함에만 들어갑니다.`
            : "";
        if (!(await appConfirm({ message: `'${label}' ${targetCount.toLocaleString()}명에게 알림을 보냅니다.\n\n${form.title}\n${form.body}${quietNote}\n\n보낸 알림은 되돌릴 수 없습니다.`, tone: "danger", confirmText: "보내기" }))) return;
        const payload = { title: form.title.trim(), body: form.body.trim(), url: form.url.trim() || undefined };
        try {
            let sent = 0, total = 0, quiet = false;
            if (targets === "all" || targets === "golf") {
                setSending({ done: 0, total: targetCount });
                const r: any = await apiRequest("/api/hiq/admin/push", { method: "POST", body: { ...payload, memberIds: targets } });
                sent = r.sent; total = r.total; quiet = r.quiet === true;
            } else {
                setSending({ done: 0, total: targets.length });
                for (let i = 0; i < targets.length; i += CHUNK) {
                    const r: any = await apiRequest("/api/hiq/admin/push", { method: "POST", body: { ...payload, memberIds: targets.slice(i, i + CHUNK) } });
                    sent += r.sent; total += r.total;
                    setSending({ done: Math.min(targets.length, i + CHUNK), total: targets.length });
                }
            }
            if (quiet) {
                toast({ title: `알림함에 넣었습니다 — ${sent.toLocaleString()}/${total.toLocaleString()}명`, description: "골프 알림 조용한 시간이라 기기 알림은 보내지 않았습니다." });
            } else {
                toast({ title: `발송 완료 — ${sent.toLocaleString()}/${total.toLocaleString()}명` });
            }
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
        // 칸 너비는 minmax(0,…) — 기본(auto)이면 받는 사람 칩 줄의 최소 폭만큼 칸이 늘어나 폰에서 화면 전체가 옆으로 밀린다
        // (칩은 가로로 밀리는 줄이라 칸 안에 갇혀야 한다. 2026-10-01 골프 칩을 더하며 390px 에서 55px 넘친 것을 고침)
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            <div className="min-w-0 space-y-4">
                <Panel className="p-4 space-y-3">
                    <h3 className="font-bold text-[15px]">1. 받는 사람</h3>
                    {/* 넓은 화면에서는 칩을 줄바꿈 — 가로로 밀리게 두면 1280px 에서도 마지막 칩이 잘려 보인다 */}
                    <div className="md:[&>div]:flex-wrap md:[&>div]:gap-y-2">
                        <FilterChips value={audience} onChange={setAudience} options={AUDIENCE.map((a) => ({ id: a.id, label: a.label, count: counts[a.id] }))} />
                    </div>
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
                    {audience === "golf" ? (
                        <>
                            {golfQuiet && (
                                <div role="status" className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2.5 text-[12.5px] leading-snug break-keep text-amber-900">
                                    <b>지금은 골프 알림 조용한 시간입니다({GOLF_QUIET_LABEL}).</b> 보내면 기기 알림 없이 알림함에만 들어갑니다 —
                                    기기 알림까지 보내려면 아침 {GOLF_PUSH_FROM_HOUR}시 이후에 보내세요.
                                </div>
                            )}
                            <p className="text-[12px] leading-snug break-keep text-black/45">
                                골프 기록·핸디·조인/부킹 글·신청·골프 크루 중 하나라도 있고 앱 알림을 받을 수 있는 회원입니다(긴급 조인 알림과 같은 명단).
                                골프 알림함에 들어가고, 설정에서 골프 알림을 끈 회원은 알림함에만 받습니다.
                                {!golfQuiet && ` ${GOLF_QUIET_LABEL}에는 기기 알림을 보내지 않습니다.`}
                                {golfAudience?.capped && <span className="text-amber-700"> 명단이 {golfCount?.toLocaleString()}명에서 잘렸습니다.</span>}
                            </p>
                        </>
                    ) : (
                        <p className="text-[12px] text-black/45">알림함에 저장되고, 앱을 설치하고 알림을 허용한 회원에게는 기기 알림도 갑니다.</p>
                    )}
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
                        <div className="flex gap-1.5 flex-wrap items-center mb-2">
                            <span className="mr-0.5 text-[11.5px] font-bold text-black/40">골프</span>
                            {GOLF_URL_PRESETS.map((p) => (
                                <button key={p.url} onClick={() => setForm({ ...form, url: p.url })}
                                    className={`h-8 px-3 rounded-full text-[12.5px] font-bold ${form.url === p.url ? "bg-black/80 text-white" : "bg-black/[0.05] text-black/55"}`}>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <Input value={form.url} maxLength={200} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="직접 입력 (예: /online-game)" className="h-10 font-mono text-[13px]" />
                    </div>
                </Panel>

                <Button data-admin-write disabled={!canSend} onClick={send} className="w-full h-12 bg-brand hover:bg-brand-strong text-white font-bold text-[15px]">
                    {sending
                        ? `보내는 중… ${sending.done.toLocaleString()}/${sending.total.toLocaleString()}`
                        : inboxOnly ? `${targetCount.toLocaleString()}명 알림함에만 넣기` : `${targetCount.toLocaleString()}명에게 보내기`}
                </Button>
            </div>

            <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
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
                                            {h.audience === "golf" && <Pill tone="info">골프</Pill>}
                                            <Pill tone={rate >= 30 ? "brand" : "neutral"}>읽음 {rate}%</Pill>
                                        </div>
                                        <p className="text-[12px] text-black/50 truncate">{h.body}</p>
                                        <p className="text-[11.5px] text-black/40 tabular-nums">
                                            {kstDateTime(h.sentAt)} · {h.recipients.toLocaleString()}명 중 {h.readCount.toLocaleString()}명 읽음{h.url ? ` · ${h.url}` : ""}
                                        </p>
                                        <button onClick={() => {
                                            setForm({ title: h.title, body: h.body, url: h.url ?? "" });
                                            if (h.audience === "golf") setAudience("golf");
                                        }} className="mt-0.5 text-[11.5px] font-bold text-brand">이 내용 다시 쓰기</button>
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
