/**
 * 어드민 "신고/제재 센터"(2026-09-11, 스토어 심사 SX1 — Apple 1.2 / Play UGC).
 *
 * 예전엔 서버가 늘 빈 배열을 돌려줘서 "클린합니다"만 보였다. 신고(hiq_reports)는 쌓이는데 볼 곳이 없었다.
 * 이제 대상별로 묶은 큐를 미처리 먼저 보여 주고, 여기서 바로 블라인드·삭제·작성자 정지·기각·이의제기 판정을 한다.
 * - 버튼은 서버가 내려준 actions 만 그린다(server/lib/reportQueue.ts availableActions) — 화면과 서버 판단이 어긋나지 않게.
 * - 모든 조치는 확인을 한 번 거친다. 삭제·정지는 되돌리기 어렵다.
 * - 신고자 이름·신고된 원문은 브라우저 저장소에 남기지 않는다: 쿼리 캐시가 통째로 localStorage 에 영속화되므로
 *   (lib/queryClient persist) 캐시 수명을 0 으로 두고 화면을 떠날 때 지운다.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucideRefreshCw, LucideChevronDown, LucideChevronUp } from "@/lib/icons";

type Action = "blind" | "unblind" | "delete" | "ban" | "unban" | "dismiss" | "appeal_approve" | "appeal_reject";
type Filter = "open" | "handled" | "all";
type QueueState = "open" | "actioned" | "dismissed";

interface QueueItem {
    key: string;
    targetType: string;
    targetId: string;
    typeLabel: string;
    state: QueueState;
    overdue: boolean;
    reportCount: number;
    reporterCount: number;
    pendingCount: number;
    reasons: { reason: string; label: string; count: number }[];
    latestReportedAt: string | null;
    oldestPendingAt: string | null;
    reports: { id: string; reporterName: string; reasonLabel: string; detail: string | null; status: string; createdAt: string }[];
    content: {
        exists: boolean; title: string | null; text: string | null; images: string[];
        isBlinded: boolean | null; blindReason: string | null; meta: string | null; link: string | null;
        crewName: string | null; createdAt: string | null;
    };
    author: { memberId: string; name: string; banned: boolean; canBan: boolean; banBlock: "no_account" | "staff" | null } | null;
    appeal: { text: string | null; at: string | null; open: boolean } | null;
    lastAction: { action: string; label: string; at: string; note: string | null } | null;
    history: { action: string; label: string; at: string; note: string | null }[];
    actions: Action[];
}
interface QueuePage { items: QueueItem[]; openCount: number; total: number; hasMore: boolean; offset: number; limit: number }

const QUEUE_URL = "/api/hiq/admin/reports";
const PAGE = 30;

type Tone = "primary" | "danger" | "neutral";
const ACTION_UI: Record<Action, { label: string; confirm: string; tone: Tone }> = {
    appeal_approve: { label: "이의제기 승인", confirm: "이의제기를 받아들여 블라인드를 풀까요? 작성자에게 결과 알림이 갑니다.", tone: "primary" },
    appeal_reject: { label: "이의제기 반려", confirm: "블라인드를 유지하고 이의제기를 반려할까요? 작성자에게 결과 알림이 갑니다.", tone: "neutral" },
    blind: { label: "블라인드", confirm: "이 콘텐츠를 가릴까요? 작성자에게 안내 알림이 가고, 커뮤니티 글·댓글은 작성자가 이의제기할 수 있습니다.", tone: "primary" },
    unblind: { label: "블라인드 해제", confirm: "가린 콘텐츠를 다시 보이게 할까요? 작성자에게 안내 알림이 갑니다.", tone: "neutral" },
    delete: { label: "삭제", confirm: "이 콘텐츠를 삭제할까요? 되돌릴 수 없습니다. 원문 일부는 처리 기록에 남습니다.", tone: "danger" },
    ban: { label: "작성자 계정 정지", confirm: "작성자 계정을 정지할까요? 잘못 눌렀다면 '정지 해제'로 되돌릴 수 있습니다.", tone: "danger" },
    unban: { label: "정지 해제", confirm: "이 회원의 계정 정지를 풀까요?", tone: "neutral" },
    dismiss: { label: "신고 기각", confirm: "문제없음으로 판단하고 신고를 닫을까요? 콘텐츠는 그대로 둡니다.", tone: "neutral" },
};
const TONE_CLS: Record<Tone, string> = {
    primary: "bg-brand text-brand-fg",
    danger: "bg-white border border-red-500/30 text-red-600 hover:bg-red-500/[0.06]",
    neutral: "bg-white border border-black/10 text-black/70 hover:bg-black/[0.04]",
};
const STATE_UI: Record<QueueState, { label: string; cls: string }> = {
    open: { label: "미처리", cls: "bg-red-500/10 text-red-600" },
    actioned: { label: "조치 완료", cls: "bg-brand/10 text-brand" },
    dismissed: { label: "기각", cls: "bg-black/[0.05] text-black/60" },
};
const REPORT_STATUS: Record<string, string> = { pending: "대기", actioned: "조치", dismissed: "기각" };
const FILTERS: { id: Filter; label: string }[] = [
    { id: "open", label: "미처리" },
    { id: "handled", label: "처리됨" },
    { id: "all", label: "전체" },
];
const EMPTY: Record<Filter, string> = {
    open: "처리할 신고가 없습니다.",
    handled: "처리한 신고가 아직 없습니다.",
    all: "들어온 신고가 없습니다.",
};
const BAN_BLOCK: Record<"no_account" | "staff", string> = {
    no_account: "로그인 계정이 없는 회원이라 정지할 수 없음",
    staff: "운영자 계정",
};

const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";
function ago(iso: string | null) {
    if (!iso) return "–";
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.floor(h / 24)}일 전`;
}
const isHttp = (u: string) => /^https?:\/\//.test(u);

export default function ModerationView() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<Filter>("open");
    const [offset, setOffset] = useState(0);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery<QueuePage>({
        queryKey: [QUEUE_URL, { status: filter, offset, limit: PAGE }],
        gcTime: 0,
        staleTime: 0,
        refetchInterval: 60_000, // 열어 둔 동안 새 신고를 1분마다 받아 온다
    });
    // 화면을 떠나면 캐시에서 지운다 → 영속화된 localStorage 스냅샷에서도 빠진다(옛 배열 모양 캐시 포함).
    useEffect(() => () => { queryClient.removeQueries({ queryKey: [QUEUE_URL] }); }, [queryClient]);

    const act = useMutation({
        mutationFn: async (v: { item: QueueItem; action: Action }) => apiRequest(`${QUEUE_URL}/action`, {
            method: "POST",
            body: { targetType: v.item.targetType, targetId: v.item.targetId, action: v.action },
        }),
        onSuccess: (_r, v) => {
            toast({ title: `${ACTION_UI[v.action].label} 처리했습니다` });
            queryClient.invalidateQueries({ queryKey: [QUEUE_URL] });
        },
        onError: (e: any) => {
            toast({ title: e?.message || "처리하지 못했습니다", variant: "destructive" });
            queryClient.invalidateQueries({ queryKey: [QUEUE_URL] });
        },
    });

    const run = (item: QueueItem, action: Action) => {
        const who = item.author ? `\n\n대상: ${item.typeLabel} · ${item.author.name}` : `\n\n대상: ${item.typeLabel}`;
        if (!window.confirm(`${ACTION_UI[action].confirm}${who}`)) return;
        act.mutate({ item, action });
    };

    // 옛 응답(배열)이 캐시에서 올라와도 깨지지 않게 모양을 확인한다.
    const page = data && !Array.isArray(data) ? data : undefined;
    const items = page?.items ?? [];

    return (
        <div className="max-w-4xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="inline-flex p-1 rounded-xl bg-black/[0.04] self-start">
                    {FILTERS.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => { setFilter(f.id); setOffset(0); }}
                            className={`h-9 px-4 rounded-lg text-[13px] font-semibold transition-colors ${filter === f.id
                                ? "bg-white text-[rgba(0,0,0,0.87)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                                : "text-black/55 hover:text-black/75"}`}
                        >
                            {f.label}
                            {f.id === "open" && page && <span className="ml-1.5 rk-num">{page.openCount}</span>}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => refetch()}
                    className="self-start sm:self-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-semibold text-black/60 hover:bg-black/[0.04]"
                >
                    <LucideRefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
                    새로고침
                </button>
            </div>
            <p className="text-[13px] text-black/55 mb-5">
                신고는 접수 후 24시간 안에 처리해 주세요. 새 신고가 들어오면 운영자 계정으로 알림이 갑니다(같은 대상은 1시간에 한 번).
            </p>

            {isLoading && <div className="py-16 text-center text-sm text-black/55">불러오는 중…</div>}
            {isError && (
                <div className="py-10 text-center">
                    <p className="text-sm text-red-600 mb-3">{(error as any)?.message || "신고 목록을 불러오지 못했습니다"}</p>
                    <button onClick={() => refetch()} className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04]">
                        다시 시도
                    </button>
                </div>
            )}
            {!isLoading && !isError && items.length === 0 && (
                <div className="py-16 text-center text-sm text-black/55">{EMPTY[filter]}</div>
            )}

            <div className="space-y-4">
                {items.map((item) => (
                    <ReportCard key={item.key} item={item} busy={act.isPending} onAction={(a) => run(item, a)} />
                ))}
            </div>

            {page && (offset > 0 || page.hasMore) && (
                <div className="flex items-center justify-center gap-2 mt-6">
                    <button
                        disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - PAGE))}
                        className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04] disabled:opacity-40"
                    >
                        이전
                    </button>
                    <span className="text-[13px] text-black/55 rk-num">{items.length ? `${offset + 1}–${offset + items.length}` : "–"}</span>
                    <button
                        disabled={!page.hasMore}
                        onClick={() => setOffset(offset + PAGE)}
                        className="h-9 px-4 rounded-xl text-[13px] font-semibold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04] disabled:opacity-40"
                    >
                        다음
                    </button>
                </div>
            )}
        </div>
    );
}

function ReportCard({ item, busy, onAction }: { item: QueueItem; busy: boolean; onAction: (a: Action) => void }) {
    const [open, setOpen] = useState(false);
    const st = STATE_UI[item.state];
    const c = item.content;
    const images = c.images.filter(isHttp).slice(0, 6);

    return (
        <div className={`bg-white rounded-2xl border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${item.overdue ? "border-red-500/40" : "border-black/[0.07]"}`}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className={`rk-chip ${st.cls}`}>{st.label}</span>
                {item.overdue && <span className="rk-chip bg-red-600 text-white">24시간 초과</span>}
                <span className="rk-chip bg-black/[0.05] text-black/70">{item.typeLabel}</span>
                {c.crewName && <span className="rk-chip bg-black/[0.03] text-black/60">{c.crewName}</span>}
                <span className="text-[13px] text-black/60">
                    신고 <b className="rk-num font-bold text-[rgba(0,0,0,0.87)]">{item.reportCount}</b>건 · 신고자 <span className="rk-num">{item.reporterCount}</span>명
                </span>
                <span className="sm:ml-auto text-[12px] text-black/55" title={when(item.latestReportedAt)}>
                    최근 신고 {ago(item.latestReportedAt)}
                </span>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
                {item.reasons.map((r) => (
                    <span key={r.reason} className="rk-chip bg-red-500/[0.06] text-red-700">
                        {r.label} <span className="rk-num">{r.count}</span>
                    </span>
                ))}
            </div>

            <div className="rounded-xl bg-black/[0.03] p-4 mb-3">
                {!c.exists ? (
                    <p className="text-[13px] text-black/55">
                        원문이 없습니다 — 이미 삭제됐거나 작성자가 지웠습니다.
                        {item.history.some((h) => h.note) ? " 삭제 전 내용은 아래 처리 기록에 있습니다." : ""}
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            {c.meta && <span className="text-[12px] text-black/55">{c.meta}</span>}
                            {c.createdAt && <span className="text-[12px] text-black/45">{when(c.createdAt)} 작성</span>}
                            {c.isBlinded && <span className="rk-chip bg-amber-500/15 text-amber-800">블라인드됨</span>}
                            {c.link && (
                                <a href={c.link} target="_blank" rel="noopener noreferrer" className="ml-auto text-[12px] font-semibold text-brand hover:underline">
                                    원문 열기
                                </a>
                            )}
                        </div>
                        {c.title && <p className="text-[15px] font-bold text-[rgba(0,0,0,0.87)] mb-1 break-words">{c.title}</p>}
                        {c.text
                            ? <p className="text-[14px] text-black/75 whitespace-pre-line break-words">{c.text}</p>
                            : !images.length && <p className="text-[13px] text-black/45">(글 없음)</p>}
                        {images.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {images.map((u) => (
                                    <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                                        <img src={u} alt="" loading="lazy" className="w-20 h-20 rounded-lg object-cover bg-black/[0.06]" />
                                    </a>
                                ))}
                            </div>
                        )}
                        {c.isBlinded && c.blindReason && <p className="text-[12px] text-black/55 mt-2">가린 이유: {c.blindReason}</p>}
                    </>
                )}
            </div>

            {item.author && (
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-black/60 mb-3">
                    <span>{item.targetType === "member" ? "신고된 회원" : "작성자"}</span>
                    <span className="font-semibold text-[rgba(0,0,0,0.87)]">{item.author.name}</span>
                    {item.author.banned && <span className="rk-chip bg-red-600/10 text-red-700">정지됨</span>}
                    {item.author.banBlock && <span className="text-[12px] text-black/50">({BAN_BLOCK[item.author.banBlock]})</span>}
                </div>
            )}

            {item.appeal && (
                <div className={`rounded-xl p-4 mb-3 ${item.appeal.open ? "bg-amber-500/10 border border-amber-500/30" : "bg-black/[0.03]"}`}>
                    <p className="text-[12px] font-semibold text-amber-800 mb-1">
                        작성자 이의제기 · {item.appeal.open ? "판단 필요" : "처리됨"}
                        <span className="ml-1.5 font-normal text-black/50">{when(item.appeal.at)}</span>
                    </p>
                    <p className="text-[14px] text-black/75 whitespace-pre-line break-words">{item.appeal.text || "(사유 없음)"}</p>
                </div>
            )}

            {item.lastAction && (
                <p className="text-[12px] text-black/55 mb-3">
                    마지막 처리: <b className="font-semibold text-black/70">{item.lastAction.label}</b> · {when(item.lastAction.at)}
                </p>
            )}

            {item.actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {item.actions.map((a) => (
                        <button
                            key={a}
                            disabled={busy}
                            onClick={() => onAction(a)}
                            className={`h-9 px-4 rounded-xl text-[13px] font-semibold transition-colors active:scale-[0.98] disabled:opacity-40 ${TONE_CLS[ACTION_UI[a].tone]}`}
                        >
                            {ACTION_UI[a].label}
                        </button>
                    ))}
                </div>
            )}

            <button
                onClick={() => setOpen(!open)}
                className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-black/55 hover:text-black/75"
            >
                {open ? <LucideChevronUp size={14} /> : <LucideChevronDown size={14} />}
                {item.history.length ? "신고 내역·처리 기록" : "신고 내역"} {open ? "접기" : "보기"}
            </button>
            {open && (
                <div className="mt-3 space-y-3">
                    <ul className="divide-y divide-black/[0.06] rounded-xl border border-black/[0.07]">
                        {item.reports.map((r) => (
                            <li key={r.id} className="px-4 py-2.5 text-[13px]">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-[rgba(0,0,0,0.87)]">{r.reporterName}</span>
                                    <span className="text-black/60">{r.reasonLabel}</span>
                                    <span className="text-[12px] text-black/50">{REPORT_STATUS[r.status] ?? r.status}</span>
                                    <span className="ml-auto text-[12px] text-black/50">{when(r.createdAt)}</span>
                                </div>
                                {r.detail && <p className="mt-1 text-black/65 whitespace-pre-line break-words">{r.detail}</p>}
                            </li>
                        ))}
                        {item.reportCount > item.reports.length && (
                            <li className="px-4 py-2 text-[12px] text-black/50">외 {item.reportCount - item.reports.length}건</li>
                        )}
                    </ul>
                    {item.history.length > 0 && (
                        <ul className="space-y-1.5">
                            {item.history.map((h, i) => (
                                <li key={`${h.at}-${i}`} className="text-[12px] text-black/60">
                                    <span className="rk-num">{when(h.at)}</span> · <b className="font-semibold text-black/75">{h.label}</b>
                                    {h.note && <span className="block mt-0.5 text-black/55 whitespace-pre-line break-words">삭제 전 내용: {h.note}</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
