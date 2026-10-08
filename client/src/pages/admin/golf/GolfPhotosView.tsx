/**
 * 골프 관리 — 라운드 사진(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 왜: 공개 라운드 사진은 사전 승인 없이 바로 골프장 페이지에 뜬다(2026-09-30 오너 결정). 그동안 운영자가 볼 곳은 신고가 들어온
 * 사진(신고 큐)뿐이었고, 거기서도 이의제기를 판정할 버튼이 없었다(감사 4.1). 여기서 훑어보고 가리고·지우고·이의제기를 판정한다.
 * - 쓰기는 신고 큐와 같은 실행기(server/services/moderation)로 간다 — 처리 기록이 한 곳에 쌓이고 큐의 '판단 필요'도 함께 닫힌다.
 * - 버튼은 서버가 행마다 내려준 actions 만 그린다(server/storage/adminGolfPhotos toAdminPhoto) — 화면과 서버 판단이 어긋나지 않게.
 * - 동반자 얼굴이 찍혀 있을 수 있다: 썸네일은 늦게 불러오고(lazy), 큰 사진은 시트를 열 때만, 내려받기 단추·원본 링크는 두지 않는다.
 * - 목록(사진 주소·이름·이의제기 글)은 브라우저 저장소에 남기지 않는다 — 쿼리 캐시가 localStorage 에 영속화되므로(lib/queryClient)
 *   캐시 수명을 0 으로 두고 화면을 떠날 때 지운다(신고 큐 ModerationView 와 같은 방식).
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LucideRefreshCw, LucideChevronRight, LucideExternalLink, LucideImage } from "@/lib/icons";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, kstDateTime, kstDate, agoLabel, daysSince, ADMIN_STICKY_TOP, SHEET_SAFE_TOP } from "../adminUtils";

export const GOLF_PHOTOS_KEY = ["/api/hiq/admin/golf/photos"] as const;
/** 신고 큐 — 이 화면의 조치가 큐의 신고를 닫으므로 함께 새로 읽는다(사이드바 숫자 포함) */
const REPORT_KEYS = [["/api/hiq/admin/reports"], ["/api/hiq/admin/reports/count"]] as const;
/** 대시보드가 ?tab= 을 읽어 그 탭을 연다(dashboard.tsx DEEP_LINK_TABS) */
const REPORT_QUEUE_PATH = "/admin/dashboard?tab=moderation";
const PAGE = 48;

type Filter = "public" | "hidden" | "appealed" | "all";
type Action = "appeal_approve" | "appeal_reject" | "blind" | "unblind" | "delete";
type Days = "" | "7" | "30";

interface AdminPhoto {
    id: string;
    url: string | null;
    thumbUrl: string | null;
    width: number | null;
    height: number | null;
    holeNo: number | null;
    course: { slug: string | null; name: string | null; path: string | null };
    round: { id: string; at: string | null };
    uploader: { id: string; name: string };
    isPublic: boolean;
    hiddenAt: string | null;
    appeal: { text: string | null; at: string | null; open: boolean } | null;
    openReports: number;
    reportCount: number;
    lastAction: { action: string; label: string; at: string } | null;
    actions: Action[];
    createdAt: string;
}
interface PhotoPage {
    items: AdminPhoto[];
    counts: Record<Filter, number>;
    total: number;
    hasMore: boolean;
    offset: number;
    limit: number;
}

const FILTERS: { id: Filter; label: string }[] = [
    { id: "public", label: "공개" },
    { id: "hidden", label: "가림" },
    { id: "appealed", label: "이의제기" },
    { id: "all", label: "전체" },
];
const EMPTY: Record<Filter, string> = {
    public: "골프장 페이지에 공개 중인 사진이 없습니다.",
    hidden: "가린 사진이 없습니다.",
    appealed: "판단을 기다리는 이의제기가 없습니다.",
    all: "올라온 라운드 사진이 없습니다.",
};
const HINT: Record<Filter, string> = {
    public: "지금 골프장 페이지에 보이는 사진입니다. 최근에 올라온 것부터.",
    hidden: "신고 누적(서로 다른 3명) 또는 운영자가 가린 사진입니다. 올린 사람에게만 보입니다.",
    appealed: "가린 사진에 올린 사람이 이의제기했습니다. 오래 기다린 것부터 — 받아들이거나 거절하면 결과 알림이 갑니다.",
    all: "공개·비공개(앨범만)·가린 사진 전부. 최근에 올라온 것부터.",
};

type Tone = "primary" | "neutral" | "danger";
const ACTION_UI: Record<Action, { label: string; confirm: string; confirmText: string; done: string; tone: Tone }> = {
    appeal_approve: {
        label: "이의제기 받아들이기", confirmText: "받아들이기", tone: "primary", done: "이의제기를 받아들였습니다",
        confirm: "이의제기를 받아들일까요? (사진이 다시 보이고 열린 신고는 기각으로 닫힙니다. 올린 사람에게 결과 알림이 갑니다)",
    },
    appeal_reject: {
        label: "거절하기", confirmText: "거절하기", tone: "neutral", done: "이의제기를 거절했습니다",
        confirm: "이의제기를 거절할까요? (사진은 계속 가려지고, 올린 사람에게 결과 알림이 갑니다)",
    },
    blind: {
        label: "가리기", confirmText: "가리기", tone: "neutral", done: "가렸습니다",
        confirm: "이 사진을 가릴까요? (골프장 페이지·앨범에서 내려가고, 올린 사람에게 안내와 이의제기 버튼이 갑니다)",
    },
    unblind: {
        label: "다시 보이기", confirmText: "보이기", tone: "neutral", done: "다시 보이게 했습니다",
        confirm: "이 사진을 다시 보이게 할까요? (공개 사진이면 골프장 페이지에 다시 뜨고, 올린 사람에게 안내가 갑니다)",
    },
    delete: {
        label: "지우기", confirmText: "지우기", tone: "danger", done: "지웠습니다",
        confirm: "이 사진을 지울까요? (원본·썸네일 파일까지 지워 되돌릴 수 없습니다. 올린 사람에게 삭제 안내가 갑니다)",
    },
};
const TONE_CLS: Record<Tone, string> = {
    primary: "bg-brand text-white hover:bg-brand-strong",
    neutral: "bg-white border border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.03]",
    danger: "bg-white border border-red-500/30 text-red-600 hover:bg-red-500/[0.06]",
};

/** 사진의 지금 상태 한 단어 — 타일 위 알약과 시트 머리줄이 같은 말을 쓴다 */
function statusOf(p: AdminPhoto): { label: string; tone: "alert" | "warn" | "neutral" | "brand" } {
    if (p.appeal?.open) return { label: "이의제기", tone: "alert" };
    if (p.hiddenAt) return { label: "가림", tone: "warn" };
    if (!p.isPublic) return { label: "비공개", tone: "neutral" };
    return { label: "공개", tone: "brand" };
}
/** 사진 위에 얹는 알약은 바탕을 채운다 — 반투명이면 하늘·잔디 위에서 글자가 묻힌다 */
const TILE_PILL: Record<string, string> = {
    alert: "bg-red-600 text-white",
    warn: "bg-amber-400 text-black/80",
    neutral: "bg-black/60 text-white",
    brand: "bg-brand text-white",
};
/** 이의제기는 24시간 안에 판단한다(신고 큐와 같은 약속) — 넘기면 빨갛게 */
const isOverdue = (p: AdminPhoto) => !!p.appeal?.open && daysSince(p.appeal.at) > 1;
/** 타일 아래 시각 — 지금 상태가 시작된 때(이의제기·가림), 아니면 올린 때 */
const timeLabel = (p: AdminPhoto) =>
    p.appeal?.open ? `이의제기 ${agoLabel(p.appeal.at)}` : p.hiddenAt ? `가림 ${agoLabel(p.hiddenAt)}` : agoLabel(p.createdAt);

function useDebounced<T>(value: T, ms: number): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

export default function GolfPhotosView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const [, setLocation] = useLocation();
    const [filter, setFilter] = useState<Filter>("public");
    const [search, setSearch] = useState("");
    const [days, setDays] = useState<Days>("");
    const course = useDebounced(search.trim(), 300);
    // 쪽 번호는 조건(거르기·골프장·기간)에 묶는다 — 조건이 바뀌면 첫 쪽부터(옛 쪽 번호로 한 번 더 불러오지 않게)
    const sig = `${filter}|${course}|${days}`;
    const [page, setPage] = useState({ sig, offset: 0 });
    const offset = page.sig === sig ? page.offset : 0;
    const [selected, setSelected] = useState<AdminPhoto | null>(null);
    const [note, setNote] = useState("");

    const { data, isLoading, isError, error, refetch, isFetching, isPlaceholderData } = useQuery<PhotoPage>({
        queryKey: [...GOLF_PHOTOS_KEY, { filter, course: course || undefined, days: days || undefined, offset, limit: PAGE }],
        gcTime: 0,
        staleTime: 0,
        placeholderData: (prev) => prev, // 쪽을 넘길 때 빈 화면으로 깜빡이지 않게
    });
    // 화면을 떠나면 캐시에서 지운다 → 영속화된 localStorage 스냅샷에서도 빠진다.
    useEffect(() => () => { qc.removeQueries({ queryKey: GOLF_PHOTOS_KEY }); }, [qc]);

    const act = useMutation({
        mutationFn: async (v: { photo: AdminPhoto; action: Action; note?: string }) => {
            const base = `${GOLF_PHOTOS_KEY[0]}/${v.photo.id}`;
            switch (v.action) {
                case "blind":
                case "unblind":
                    return apiRequest(`${base}/hide`, { method: "POST", body: { hidden: v.action === "blind" } });
                case "appeal_approve":
                case "appeal_reject":
                    return apiRequest(`${base}/appeal`, {
                        method: "POST",
                        body: { decision: v.action === "appeal_approve" ? "approve" : "reject", ...(v.note ? { note: v.note } : {}) },
                    });
                case "delete":
                    return apiRequest(base, { method: "DELETE" });
            }
        },
        onSuccess: (_r, v) => {
            toast({ title: ACTION_UI[v.action].done });
            setSelected(null);
        },
        onError: (e: any, v) => toast({ title: `${ACTION_UI[v.action].label} 실패`, description: e?.message ?? "", variant: "destructive" }),
        onSettled: () => {
            qc.invalidateQueries({ queryKey: GOLF_PHOTOS_KEY });
            for (const k of REPORT_KEYS) qc.invalidateQueries({ queryKey: k });
        },
    });

    const run = async (photo: AdminPhoto, action: Action) => {
        const ui = ACTION_UI[action];
        const who = `\n\n${photo.course.name ?? "골프장 미상"} · 올린 사람 ${photo.uploader.name}`;
        if (!(await appConfirm({ message: `${ui.confirm}${who}`, tone: ui.tone === "danger" ? "danger" : "default", confirmText: ui.confirmText }))) return;
        const memo = note.trim();
        act.mutate({ photo, action, ...(memo && action.startsWith("appeal_") ? { note: memo } : {}) });
    };

    const open = (p: AdminPhoto) => { setNote(""); setSelected(p); };
    const pageData = data && Array.isArray(data.items) ? data : undefined;
    const items = Array.isArray(pageData?.items) ? pageData!.items : [];
    const counts = pageData?.counts;

    return (
        <div className="space-y-3">
            {/* 도구 줄: 거르기 칩 · 골프장 검색 · 기간 · 새로고침 */}
            <div className={`${ADMIN_STICKY_TOP} z-10 -mx-4 md:mx-0 px-4 md:px-0 py-2 bg-surface-0/95 backdrop-blur space-y-2 md:space-y-0 md:flex md:items-center md:gap-3`}>
                <div className="min-w-0 md:flex-1">
                    <FilterChips value={filter} onChange={setFilter} options={FILTERS.map((f) => ({
                        id: f.id, label: f.label, count: counts?.[f.id], alert: f.id === "appealed",
                    }))} />
                </div>
                <div className="flex gap-2">
                    <SearchBox value={search} onChange={setSearch} placeholder="골프장 이름" className="flex-1 min-w-0 md:w-60 md:flex-none" />
                    <select value={days} onChange={(e) => setDays(e.target.value as Days)} aria-label="올린 기간"
                        className="h-10 shrink-0 px-2 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/65 outline-none">
                        <option value="">전체 기간</option>
                        <option value="7">최근 7일</option>
                        <option value="30">최근 30일</option>
                    </select>
                    <button onClick={() => refetch()} aria-label="새로고침" title="새로고침"
                        className="h-10 w-10 shrink-0 rounded-xl bg-white border border-black/10 flex items-center justify-center text-black/55 hover:text-brand">
                        <LucideRefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-[13px] font-bold text-black/60">
                    {FILTERS.find((f) => f.id === filter)?.label} <span className="text-brand tabular-nums">{(pageData?.total ?? 0).toLocaleString()}</span>장
                </p>
                <p className="text-[12.5px] text-black/45">{HINT[filter]}</p>
            </div>

            {isLoading ? (
                <EmptyState>불러오는 중…</EmptyState>
            ) : isError ? (
                <EmptyState>
                    <span className="block text-red-600 mb-3">{(error as any)?.message || "사진 목록을 불러오지 못했습니다"}</span>
                    <button onClick={() => refetch()} className="h-9 px-4 rounded-xl text-[13px] font-bold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04]">
                        다시 시도
                    </button>
                </EmptyState>
            ) : items.length === 0 ? (
                <EmptyState>{course || days ? "해당하는 사진이 없습니다." : EMPTY[filter]}</EmptyState>
            ) : (
                // 조건을 바꾼 직후엔 앞 목록을 흐리게 둔다(새 목록이 올 때까지 — 다른 칩의 사진을 지금 것으로 오해하지 않게)
                <ul className={`grid grid-cols-3 md:grid-cols-6 gap-x-2 gap-y-3 transition-opacity ${isPlaceholderData ? "opacity-50" : ""}`}>
                    {items.map((p) => <PhotoTile key={p.id} photo={p} onOpen={() => open(p)} />)}
                </ul>
            )}

            {pageData && (offset > 0 || pageData.hasMore) && (
                <div className="flex items-center justify-center gap-2 pt-2">
                    <button disabled={offset === 0} onClick={() => setPage({ sig, offset: Math.max(0, offset - PAGE) })}
                        className="h-9 px-4 rounded-xl text-[13px] font-bold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04] disabled:opacity-40">
                        이전
                    </button>
                    <span className="text-[13px] text-black/55 tabular-nums">{items.length ? `${offset + 1}–${offset + items.length}` : "–"}</span>
                    <button disabled={!pageData.hasMore} onClick={() => setPage({ sig, offset: offset + PAGE })}
                        className="h-9 px-4 rounded-xl text-[13px] font-bold bg-white border border-black/10 text-black/70 hover:bg-black/[0.04] disabled:opacity-40">
                        다음
                    </button>
                </div>
            )}

            <p className="text-[12px] text-black/40 leading-relaxed">
                동반자 얼굴이 나온 사진이 있을 수 있습니다. 확인만 하고 내려받거나 밖으로 옮기지 마세요.
            </p>

            <PhotoSheet
                photo={selected}
                busy={act.isPending}
                note={note}
                onNote={setNote}
                onClose={() => setSelected(null)}
                onAction={(a) => selected && run(selected, a)}
                onOpenMember={onOpenMember ? (id) => { setSelected(null); onOpenMember(id); } : undefined}
                onOpenQueue={() => { setSelected(null); setLocation(REPORT_QUEUE_PATH); }}
            />
        </div>
    );
}

function PhotoTile({ photo: p, onOpen }: { photo: AdminPhoto; onOpen: () => void }) {
    const st = statusOf(p);
    return (
        <li className="min-w-0">
            <button onClick={onOpen} aria-label={`${p.course.name ?? "골프장 미상"} · ${p.uploader.name} 사진 열기`}
                className="group block w-full text-left">
                <span className="relative block aspect-square rounded-xl overflow-hidden bg-black/[0.06] ring-1 ring-inset ring-black/[0.06]">
                    {p.thumbUrl ? (
                        <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false}
                            className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-[1.03]" />
                    ) : (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[12px] text-black/40">
                            <LucideImage className="w-5 h-5" />주소 확인 불가
                        </span>
                    )}
                    {st.label !== "공개" && (
                        <span className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${TILE_PILL[st.tone]}`}>{st.label}</span>
                    )}
                    {p.openReports > 0 && (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[11.5px] font-bold text-white tabular-nums">
                            신고 {p.openReports}
                        </span>
                    )}
                </span>
                <span className="mt-1.5 block truncate text-[12.5px] font-bold text-[rgba(0,0,0,0.87)]">{p.course.name ?? "골프장 미상"}</span>
                {/* 시각을 앞에 — 폰 3칸에서 잘려도 '얼마나 기다렸나'는 보이게 */}
                <span className="block truncate text-[12px] text-black/45 tabular-nums">
                    <span className={isOverdue(p) ? "font-bold text-red-600" : ""}>{timeLabel(p)}</span> · {p.uploader.name}
                </span>
            </button>
        </li>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 px-4 py-3 min-h-[44px]">
            <span className="w-[4.5rem] shrink-0 text-[12.5px] font-bold text-black/45">{label}</span>
            <div className="min-w-0 flex-1 text-[13.5px] text-[rgba(0,0,0,0.87)]">{children}</div>
        </div>
    );
}

function PhotoSheet({ photo: p, busy, note, onNote, onClose, onAction, onOpenMember, onOpenQueue }: {
    photo: AdminPhoto | null;
    busy: boolean;
    note: string;
    onNote: (v: string) => void;
    onClose: () => void;
    onAction: (a: Action) => void;
    onOpenMember?: (id: string) => void;
    onOpenQueue: () => void;
}) {
    const st = p ? statusOf(p) : null;
    const appealOpen = !!p?.appeal?.open;
    const decide = (p?.actions ?? []).filter((a) => a === "appeal_approve" || a === "appeal_reject");
    const content = (p?.actions ?? []).filter((a) => a === "blind" || a === "unblind");
    const canDelete = !!p?.actions.includes("delete");
    // 크기를 모르는 옛 행은 4:3 상자에 맞춰 넣는다(object-contain 이라 잘리지 않는다)
    const aspect = p?.width && p?.height ? `${p.width} / ${p.height}` : "4 / 3";

    return (
        <Sheet open={!!p} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="right" style={SHEET_SAFE_TOP} className="w-full sm:max-w-lg p-0 flex flex-col bg-surface-0">
                {p && st && (
                    <>
                        <div className="shrink-0 bg-white border-b border-black/[0.07] px-5 pt-5 pb-4 pr-12">
                            <SheetTitle className="flex items-center gap-2 text-[17px] font-bold text-[rgba(0,0,0,0.87)]">
                                <span className="truncate">{p.course.name ?? "골프장 미상"}</span>
                                <Pill tone={st.tone}>{st.label}</Pill>
                            </SheetTitle>
                            <SheetDescription className="mt-0.5 text-[12.5px] text-black/50 tabular-nums">
                                라운드 사진{p.holeNo ? ` · ${p.holeNo}번 홀` : ""} · {kstDateTime(p.createdAt)} 올림
                            </SheetDescription>
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
                            {/* 큰 사진 — 시트를 열 때만 불러온다. 썸네일(이미 받아 둔 것)을 먼저 깔고 원본이 그 위에 덮인다. 내려받기·원본 링크는 두지 않는다. */}
                            <div className="relative w-full max-h-[60vh] rounded-2xl overflow-hidden bg-black/[0.05]" style={{ aspectRatio: aspect }}>
                                {p.thumbUrl && (
                                    <img src={p.thumbUrl} alt="" aria-hidden draggable={false} className="absolute inset-0 w-full h-full object-contain" />
                                )}
                                {p.url ? (
                                    <img src={p.url} alt={`${p.course.name ?? "골프장"} 라운드 사진`} loading="lazy" decoding="async" draggable={false}
                                        className="absolute inset-0 w-full h-full object-contain" />
                                ) : !p.thumbUrl && (
                                    <span className="absolute inset-0 flex items-center justify-center text-[13px] text-black/45">사진 주소를 확인할 수 없습니다</span>
                                )}
                            </div>

                            {p.appeal && (
                                <div className={`rounded-2xl p-4 ${appealOpen ? "bg-amber-500/10 border border-amber-500/30" : "bg-white border border-black/[0.07]"}`}>
                                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] font-bold text-amber-800">
                                        올린 사람 이의제기 · {appealOpen ? "판단 필요" : "처리됨"}
                                        <span className="font-normal text-black/50 tabular-nums">{kstDateTime(p.appeal.at)}</span>
                                        {isOverdue(p) && <Pill tone="alert">24시간 초과</Pill>}
                                    </p>
                                    <p className="mt-1 text-[14px] text-black/75 whitespace-pre-line break-words">{p.appeal.text || "(사유 없음)"}</p>
                                </div>
                            )}

                            <Panel className="divide-y divide-black/[0.05] overflow-hidden">
                                <Row label="올린 사람">
                                    {onOpenMember ? (
                                        <button onClick={() => onOpenMember(p.uploader.id)} className="inline-flex max-w-full items-center gap-1 font-bold text-brand hover:underline">
                                            <span className="truncate">{p.uploader.name}</span>
                                            <LucideChevronRight className="w-3.5 h-3.5 shrink-0" />
                                        </button>
                                    ) : <span className="font-bold">{p.uploader.name}</span>}
                                </Row>
                                <Row label="골프장">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="truncate">{p.course.name ?? "골프장 미상"}</span>
                                        {p.course.path && (
                                            <a href={p.course.path} target="_blank" rel="noopener noreferrer"
                                                className="shrink-0 inline-flex items-center gap-0.5 text-[12.5px] font-bold text-brand hover:underline">
                                                페이지<LucideExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </span>
                                </Row>
                                <Row label="공개">
                                    {p.isPublic ? "공개 — 골프장 페이지에 실림" : "비공개 — 그 라운드 앨범에만"}
                                    {p.hiddenAt && <span className="block text-[12.5px] text-amber-800 tabular-nums">가림 · {kstDateTime(p.hiddenAt)}</span>}
                                </Row>
                                <Row label="라운드">
                                    <span className="tabular-nums">{kstDate(p.round.at)}</span>
                                    <span className="ml-1.5 font-mono text-[12px] text-black/40">#{p.round.id.slice(0, 8)}</span>
                                </Row>
                                <Row label="신고">
                                    {p.reportCount === 0 ? <span className="text-black/45">없음</span> : (
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="tabular-nums">
                                                {p.openReports > 0 ? <b className="text-red-600">열린 신고 {p.openReports}건</b> : "열린 신고 없음"}
                                                <span className="text-black/45"> · 전체 {p.reportCount}건</span>
                                            </span>
                                            {p.openReports > 0 && (
                                                <button onClick={onOpenQueue} className="text-[12.5px] font-bold text-brand hover:underline">신고 큐에서 사유 보기</button>
                                            )}
                                        </span>
                                    )}
                                </Row>
                                {p.lastAction && (
                                    <Row label="마지막 처리">
                                        <b className="font-bold">{p.lastAction.label}</b>
                                        <span className="ml-1.5 text-[12.5px] text-black/45 tabular-nums">{kstDateTime(p.lastAction.at)}</span>
                                    </Row>
                                )}
                            </Panel>

                            {decide.length > 0 && (
                                <label className="block">
                                    <span className="text-[12.5px] font-bold text-black/50">메모 (선택) · 처리 기록에만 남고 올린 사람에게는 가지 않습니다</span>
                                    <textarea value={note} maxLength={500} onChange={(e) => onNote(e.target.value)} rows={2}
                                        placeholder="예: 동반자 얼굴이 크게 나옴"
                                        className="mt-1 w-full rounded-xl bg-white border border-black/10 px-3 py-2 text-[14px] outline-none focus:border-brand/40 resize-none" />
                                </label>
                            )}
                        </div>

                        {(decide.length > 0 || content.length > 0 || canDelete) && (
                            <div className="shrink-0 bg-white border-t border-black/[0.07] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] space-y-2">
                                {[...decide, ...content].length > 0 && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {[...decide, ...content].map((a, i, all) => (
                                            <button data-admin-write key={a} disabled={busy} onClick={() => onAction(a)}
                                                className={`h-10 rounded-xl text-[13.5px] font-bold transition-colors active:scale-[0.99] disabled:opacity-40 ${all.length === 1 ? "col-span-2" : ""} ${TONE_CLS[ACTION_UI[a].tone]}`}>
                                                {ACTION_UI[a].label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {canDelete && (
                                    <div className="flex items-center gap-3">
                                        <button data-admin-write disabled={busy} onClick={() => onAction("delete")}
                                            className={`h-10 px-5 rounded-xl text-[13.5px] font-bold transition-colors active:scale-[0.99] disabled:opacity-40 ${TONE_CLS.danger}`}>
                                            {ACTION_UI.delete.label}
                                        </button>
                                        <span className="text-[12px] text-black/45 leading-snug">원본·썸네일 파일까지 지워 되돌릴 수 없습니다</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
