/**
 * 라운드 한 판 — 아래에서 올라오는 시트, 탭 둘: **스코어카드 | 앨범**(2026-09-30 오너: "라운드 누르면 앨범과 스코어카드").
 * 라운딩 리포트 목록·사진첩, 경기 결과 화면이 같이 연다.
 *
 *   스코어카드  선수마다 경기 화면과 같은 기록표(HoleGrid). 사진이 있는 홀은 번호 위 라임 점 — 누르면 그 홀 사진으로.
 *   앨범        그 경기 사진 전부(찍은 순서). 첫 칸은 '사진 추가'(끝난 라운드에도 나중에 올릴 수 있다). 누르면 전체 화면.
 *
 * 자료: 기록 id(historyId)가 있으면 기록 상세(/history/:id/detail — 옛 기록도 경기를 찾아 준다), 없으면 경기(/golf/match/:id).
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideCamera, LucideGlobe, LucideLoader2 } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { kstDateKey } from "@/lib/kst";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { HoleGrid, toParText } from "../ScoreCard";
import { useSessionPhotos, type AlbumPhoto } from "../../lib/photoApi";
import { PhotoViewer } from "./PhotoViewer";
import { usePhotoUploader, toViewer } from "./RoundPhotoCamera";

export type RoundTab = "score" | "album";
export interface RoundTarget {
    /** 라운딩 기록 id(hiq_game_history) — 있으면 기록 상세로 스코어카드를 읽는다 */
    historyId?: string | null;
    /** 경기 id(golf_match_sessions) */
    sessionId?: string | null;
    title?: string | null;
    /** ISO — 날짜 줄 */
    date?: string | null;
    subType?: string | null;
    tab?: RoundTab;
}

type Player = { id: string; name: string; scores: number[]; total: number };
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function ymd(iso: string) {
    const [y, m, d] = kstDateKey(iso).split("-").map(Number);
    return { y, m, d, w: WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

/** 기록 상세 → 선수·파·경기 id */
function fromHistory(game: any): { players: Player[]; pars: number[]; sessionId: string | null; courseName: string | null } {
    const pars: number[] = Array.isArray(game?.pars) && game.pars.length === 18 ? game.pars : [];
    const players = [1, 2, 3, 4].map((i) => game?.[`player${i}Id`] ? {
        id: game[`player${i}Id`], name: game[`player${i}Name`] || `선수 ${i}`,
        scores: (game[`player${i}Innings`] as number[] | undefined) ?? [], total: Number(game[`player${i}Score`] ?? 0),
    } : null).filter(Boolean) as Player[];
    return { players, pars, sessionId: game?.id ?? null, courseName: game?.locationName ?? null };
}
/** 경기 → 선수·파 */
function fromSession(s: any): { players: Player[]; pars: number[]; sessionId: string | null; courseName: string | null } {
    const pars: number[] = Array.isArray(s?.pars) && s.pars.length === 18 ? s.pars : [];
    const players = ((s?.players ?? []) as any[]).map((p, i) => {
        const scores: number[] = Array.isArray(p?.scores) ? p.scores : [];
        return { id: String(p?.memberId ?? i), name: p?.name || `선수 ${i + 1}`, scores, total: scores.reduce((a, b) => a + (b > 0 ? b : 0), 0) };
    });
    return { players, pars, sessionId: s?.id ?? null, courseName: s?.courseName ?? null };
}

function Scorecards({ players, pars, photoHoles, onHoleTap }: { players: Player[]; pars: number[]; photoHoles: Set<number>; onHoleTap: (i: number) => void }) {
    const parTotal = pars.reduce((a, b) => a + b, 0);
    return (
        <div className="space-y-3">
            {photoHoles.size > 0 && (
                <p className="flex items-center gap-1.5 text-[12.5px] text-[#FFFFFF80]">
                    <span aria-hidden className="w-[6px] h-[6px] rounded-full bg-[#9BEF5C]" />사진이 있는 홀 · 번호를 누르면 사진으로
                </p>
            )}
            {players.map((p) => {
                const toPar = parTotal ? p.total - parTotal : null;
                return (
                    <section key={p.id} className="rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] px-4 py-4">
                        <div className="flex items-baseline justify-between mb-3">
                            <span className="text-[15px] font-semibold text-[#ffffff] truncate">{p.name}</span>
                            <span className="shrink-0 tabular-nums">
                                <span className="text-[22px] font-bold text-[#ffffff]">{p.total || "–"}</span>
                                <span className="text-[13px] text-[#FFFFFF73]">타</span>
                                {toPar != null && p.total > 0 && (
                                    <span className={cn("ml-1.5 text-[13px] font-semibold", toPar < 0 ? "text-[#7DD3FC]" : toPar > 0 ? "text-[#FFB27A]" : "text-[#FFFFFFB3]")}>{toParText(toPar)}</span>
                                )}
                            </span>
                        </div>
                        {pars.length === 18 ? (
                            <HoleGrid scores={p.scores} pars={pars} currentHole={-1} photoHoles={photoHoles} onHoleTap={onHoleTap} />
                        ) : (
                            // 파 자료가 없는 코스 — 동그라미·네모(파 대비)를 지어내지 않고 타수만
                            <div className="grid grid-cols-9 gap-1 text-center">
                                {Array.from({ length: 18 }, (_, i) => (
                                    <button key={i} type="button" disabled={!photoHoles.has(i)} onClick={() => onHoleTap(i)}
                                        className="relative flex flex-col items-center py-1 rounded-md bg-[#FFFFFF06]">
                                        {photoHoles.has(i) && <span aria-hidden className="absolute top-0.5 right-0.5 w-[5px] h-[5px] rounded-full bg-[#9BEF5C]" />}
                                        <span className="text-[11px] text-[#FFFFFF59] tabular-nums">{i + 1}</span>
                                        <span className="text-[13px] font-semibold text-[#ffffff] tabular-nums">{p.scores[i] || "·"}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}

/** 앨범 칸 — 첫 칸 '사진 추가', 올리는 중인 칸, 사진들(찍은 순서) */
export function AlbumGrid({ sessionId, photos, onOpen }: { sessionId: string; photos: AlbumPhoto[]; onOpen: (i: number) => void }) {
    const up = usePhotoUploader(sessionId);
    const mineCount = photos.filter((p) => p.mine).length;
    return (
        <div>
            <div className="grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => up.pick(null)}
                    className="aspect-square rounded-xl border border-dashed border-[#64DD1780] bg-[#64DD170D] flex flex-col items-center justify-center gap-1 text-[#9BEF5C] active:bg-[#64DD171F]">
                    <LucideCamera className="w-6 h-6" />
                    <span className="text-[12.5px] font-semibold">사진 추가</span>
                    <span className="text-[12px] text-[#9BEF5CB3] tabular-nums">{mineCount}/{up.max}</span>
                </button>
                {Array.from({ length: up.pending }, (_, i) => (
                    <span key={`p${i}`} className="aspect-square rounded-xl bg-[#FFFFFF0A] flex items-center justify-center">
                        <LucideLoader2 className="w-5 h-5 animate-spin text-[#FFFFFF73]" />
                    </span>
                ))}
                {photos.map((p, i) => (
                    <button key={p.id} type="button" onClick={() => onOpen(i)} aria-label={`${p.holeNo ? `${p.holeNo}번 홀 ` : ""}사진 · ${p.mine ? "나" : p.uploaderName}`}
                        className="relative aspect-square rounded-xl overflow-hidden bg-[#FFFFFF0A]">
                        <img src={p.thumbUrl} alt="" loading="lazy" className={cn("w-full h-full object-cover", p.hidden && "opacity-40")} />
                        {p.holeNo != null && (
                            <span className="absolute left-1.5 bottom-1.5 h-[20px] px-1.5 rounded-md bg-[#000000A6] text-[12px] font-medium leading-[20px] text-[#ffffff] tabular-nums">{p.holeNo}번 홀</span>
                        )}
                        {p.mine && p.isPublic && (
                            <span className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-[#000000A6] flex items-center justify-center" aria-label="골프장 페이지에 공개">
                                <LucideGlobe className="w-3.5 h-3.5 text-[#9BEF5C]" />
                            </span>
                        )}
                        {p.hidden && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[12px] font-semibold text-[#FF8A8C]">가려짐</span>}
                    </button>
                ))}
            </div>
            {photos.length === 0 && up.pending === 0 && (
                <p className="mt-4 text-center text-[13px] text-[#FFFFFF73] break-keep">아직 사진이 없어요 · 그날의 한 장을 남겨 보세요</p>
            )}
            {mineCount > 0 && (
                <p className="mt-3 text-[12.5px] text-[#FFFFFF73] break-keep">내 사진은 기본으로 나와 동반자만 봐요 · 사진을 눌러 골프장 페이지 공개를 켜고 끌 수 있어요</p>
            )}
            {up.inputEl}
        </div>
    );
}

export function RoundDetailSheet({ target, onClose }: { target: RoundTarget | null; onClose: () => void }) {
    const [tab, setTab] = useState<RoundTab>(target?.tab ?? "score");
    const [viewer, setViewer] = useState<number | null>(null);
    useEffect(() => { setTab(target?.tab ?? "score"); setViewer(null); }, [target]);

    const historyId = target?.historyId ?? null;
    const hist = useQuery<any>({
        queryKey: [`/api/hiq/history/${historyId}/detail`],
        queryFn: () => apiRequest(`/api/hiq/history/${historyId}/detail`),
        enabled: !!historyId,
    });
    const directSession = !historyId ? target?.sessionId ?? null : null;
    const sess = useQuery<any>({
        queryKey: [`/api/hiq/golf/match/${directSession}`],
        queryFn: () => apiRequest(`/api/hiq/golf/match/${directSession}`),
        enabled: !!directSession,
    });
    const data = historyId ? (hist.data ? fromHistory(hist.data) : null) : (sess.data ? fromSession(sess.data) : null);
    const isLoading = historyId ? hist.isLoading : sess.isLoading;
    const sessionId = data?.sessionId ?? target?.sessionId ?? null;

    const photosQ = useSessionPhotos(sessionId);
    const photos = photosQ.data?.photos ?? [];
    const viewerPhotos = useMemo(() => photos.map(toViewer), [photos]);
    const photoHoles = useMemo(() => new Set(photos.filter((p) => p.holeNo).map((p) => p.holeNo! - 1)), [photos]);
    const openHole = (i: number) => {
        const at = photos.findIndex((p) => p.holeNo === i + 1);
        if (at >= 0) setViewer(at);
    };

    const d = target?.date ? ymd(target.date) : null;
    const pars = data?.pars ?? [];
    const parTotal = pars.reduce((a, b) => a + b, 0);
    const title = target?.title || data?.courseName || "라운드";

    return (
        <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="bottom" className="bg-[#0F0F0F] border-[#FFFFFF0F] rounded-t-3xl px-0 pb-0 h-[88vh] flex flex-col [&>button]:right-5 [&>button]:top-5 [&>button]:opacity-60">
                <div className="px-5 pt-5 shrink-0">
                    <p className="text-[13px] text-[#FFFFFF8C] tabular-nums">{d ? `${d.y}년 ${d.m}월 ${d.d}일 (${d.w})` : ""}</p>
                    <SheetTitle className="mt-0.5 text-[22px] font-bold tracking-tight text-[#ffffff] truncate pr-8">{title}</SheetTitle>
                    {parTotal > 0 && <p className="mt-1 text-[12.5px] text-[#FFFFFF73]">파 {parTotal}{target?.subType ? ` · ${target.subType}` : ""}</p>}
                    {/* 탭 — 스코어카드 | 앨범 */}
                    <div role="tablist" aria-label="라운드 보기" className="mt-4 grid grid-cols-2 p-1 rounded-2xl bg-[#FFFFFF0A]">
                        {([["score", "스코어카드"], ["album", "앨범"]] as const).map(([k, label]) => (
                            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                                className={cn("h-10 rounded-xl text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors",
                                    tab === k ? "bg-[#ffffff] text-[#0A0A0A]" : "text-[#FFFFFFA6]")}>
                                {label}
                                {k === "album" && photos.length > 0 && (
                                    <span className={cn("min-w-[20px] h-5 px-1.5 rounded-full text-[12px] leading-5 tabular-nums", tab === k ? "bg-[#64DD17] text-[#051907]" : "bg-[#FFFFFF1A] text-[#FFFFFFCC]")}>{photos.length}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 pt-4 scrollbar-hide" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
                    {tab === "score" ? (
                        isLoading ? (
                            <div className="py-10 flex justify-center text-[#FFFFFF59]"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                        ) : !data || data.players.length === 0 ? (
                            <p className="py-10 text-center text-[13px] text-[#FFFFFF73]">이 라운드의 홀별 기록이 없어요.</p>
                        ) : (
                            <Scorecards players={data.players} pars={pars} photoHoles={photoHoles} onHoleTap={openHole} />
                        )
                    ) : !sessionId ? (
                        isLoading ? <div className="py-10 flex justify-center text-[#FFFFFF59]"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                            : <p className="py-10 text-center text-[13px] text-[#FFFFFF73] break-keep">이 라운드는 사진을 붙일 경기를 찾지 못했어요.</p>
                    ) : photosQ.isLoading ? (
                        <div className="py-10 flex justify-center text-[#FFFFFF59]"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                    ) : (
                        <AlbumGrid sessionId={sessionId} photos={photos} onOpen={setViewer} />
                    )}
                </div>
                <PhotoViewer photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} />
            </SheetContent>
        </Sheet>
    );
}
