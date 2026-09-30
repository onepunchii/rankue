/**
 * 라운딩 리포트의 '사진첩'(2026-09-30 오너: "추억 메모리 — 라운딩 리포트에 사진첩"). 내 라운드들의 사진을 라운드(날짜)별로 묶는다.
 * 동반자가 올린 사진도 같이 모인다(같은 경기의 앨범이라서). 누르면 그 라운드의 앨범 탭이 열린다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useMemo, useState } from "react";
import { LucideCamera, LucideChevronRight } from "@/lib/icons";
import { useMyPhotos, type MinePhoto } from "../../lib/photoApi";
import { ymd } from "./RoundDetailSheet";

export interface AlbumGroup { sessionId: string; courseName: string | null; playedAt: string; photos: MinePhoto[] }

const SHOW_GROUPS = 4;
const THUMBS = 4;

export function MyPhotoAlbum({ onOpen }: { onOpen: (g: AlbumGroup) => void }) {
    const { data, isLoading } = useMyPhotos();
    const [all, setAll] = useState(false);
    const groups = useMemo(() => {
        const map = new Map<string, AlbumGroup>();
        for (const p of data ?? []) {
            const g = map.get(p.sessionId) ?? { sessionId: p.sessionId, courseName: p.courseName, playedAt: p.playedAt, photos: [] };
            g.photos.push(p);
            map.set(p.sessionId, g);
        }
        // 최신 라운드부터(사진은 최신부터 오므로 처음 본 순서가 곧 최신순). 칸 안은 찍은 순서로
        return [...map.values()].map((g) => ({ ...g, photos: [...g.photos].reverse() }));
    }, [data]);
    const total = data?.length ?? 0;

    if (isLoading) return null;
    return (
        <section>
            <div className="flex items-baseline justify-between mb-2.5">
                <h2 className="text-[17px] font-bold tracking-tight text-[#ffffff]">사진첩</h2>
                {total > 0 && <span className="text-[12.5px] text-[#FFFFFF59] tabular-nums">{total >= 60 ? "최근 60장" : `${total}장`}</span>}
            </div>
            {groups.length === 0 ? (
                <div className="rounded-2xl bg-[#FFFFFF08] px-4 py-4 flex items-center gap-3">
                    <span className="shrink-0 w-10 h-10 rounded-full bg-[#64DD171F] flex items-center justify-center">
                        <LucideCamera className="w-5 h-5 text-[#9BEF5C]" />
                    </span>
                    <p className="text-[13px] leading-[1.5] text-[#FFFFFF99] break-keep">
                        라운드 중에 점수판 위 <span className="text-[#ffffff] font-medium">카메라</span>를 누르면 그날 사진이 여기에 모여요
                    </p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {(all ? groups : groups.slice(0, SHOW_GROUPS)).map((g) => {
                        const d = ymd(g.playedAt);
                        const more = g.photos.length - THUMBS;
                        return (
                            <button key={g.sessionId} type="button" onClick={() => onOpen(g)}
                                className="w-full text-left rounded-2xl bg-[#FFFFFF08] px-3.5 pt-3 pb-3.5 active:bg-[#FFFFFF0F]">
                                <span className="flex items-center gap-2 min-w-0">
                                    <span className="text-[14px] font-semibold text-[#ffffff] tabular-nums shrink-0">{d.m}월 {d.d}일 ({d.w})</span>
                                    <span className="text-[13px] text-[#FFFFFF8C] truncate">{g.courseName || "골프장"}</span>
                                    <span className="ml-auto shrink-0 flex items-center gap-0.5 text-[12.5px] text-[#FFFFFF73] tabular-nums">
                                        {g.photos.length}장<LucideChevronRight weight="bold" className="w-3.5 h-3.5" />
                                    </span>
                                </span>
                                <span className="mt-2.5 grid grid-cols-4 gap-1.5">
                                    {g.photos.slice(0, THUMBS).map((p, i) => (
                                        <span key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-[#FFFFFF0A]">
                                            <img src={p.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
                                            {i === THUMBS - 1 && more > 0 && (
                                                <span className="absolute inset-0 bg-[#000000A6] flex items-center justify-center text-[15px] font-semibold text-[#ffffff] tabular-nums">+{more}</span>
                                            )}
                                        </span>
                                    ))}
                                </span>
                            </button>
                        );
                    })}
                    {!all && groups.length > SHOW_GROUPS && (
                        <button type="button" onClick={() => setAll(true)} className="w-full h-11 rounded-2xl bg-[#FFFFFF08] text-[13.5px] font-medium text-[#FFFFFFB3] active:bg-[#FFFFFF0F]">
                            라운드 {groups.length - SHOW_GROUPS}개 더 보기
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
