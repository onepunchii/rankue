/**
 * 골프장 페이지 '라운드 사진'(2026-09-30) — 회원이 공개로 돌린 라운드 사진. 사전 승인 없이 바로 뜬다(오너 결정),
 * 그래서 칸마다 ⋯ [신고] [차단]이 붙는다(Apple 1.2 / Play UGC). 서로 다른 3명이 신고하면 서버가 가린다.
 * 크레딧은 "사진 · 닉네임" 과 **달까지만** — 정확한 날짜·시각은 그날 거기 있었다는 위치 기록이 된다.
 * 로그아웃 방문자도 보는 페이지다(당구 테마) — 리터럴 색만.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCoursePhotos, invalidatePhotos } from "../../lib/photoApi";
import { Section } from "../course/detail/ui";
import { PhotoViewer, PhotoUgcButton, type ViewerPhoto } from "./PhotoViewer";

const FIRST = 6;

export function CoursePhotoGallery({ slug, name }: { slug: string; name: string }) {
    const qc = useQueryClient();
    const { data } = useCoursePhotos(slug);
    const [all, setAll] = useState(false);
    const [viewer, setViewer] = useState<number | null>(null);
    const photos = data ?? [];
    const viewerPhotos = useMemo<ViewerPhoto[]>(() => photos.map((p) => ({
        id: p.id, url: p.url, thumbUrl: p.thumbUrl, memberId: p.memberId, name: p.credit, month: p.month,
    })), [photos]);
    if (!photos.length) return null;
    const shown = all ? photos : photos.slice(0, FIRST);
    const refresh = () => { void invalidatePhotos(qc); };

    return (
        <Section title="라운드 사진" aside={<span className="text-[13px] text-[#FFFFFF66] tabular-nums">{photos.length}장</span>}>
            <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                {shown.map((p, i) => (
                    <figure key={p.id} className="min-w-0">
                        <button type="button" onClick={() => setViewer(i)} aria-label={`${name} 라운드 사진 · ${p.credit}`}
                            className="block w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#FFFFFF0A]">
                            <img src={p.thumbUrl} alt={`${name} 라운드 사진`} loading="lazy" className="w-full h-full object-cover" />
                        </button>
                        <figcaption className="mt-1 flex items-center gap-1 min-w-0">
                            <span className="flex-1 min-w-0">
                                <span className="block text-[12.5px] text-[#FFFFFFB3] truncate">사진 · <span className="text-[#ffffff] font-medium">{p.credit}</span></span>
                                <span className="block text-[12px] text-[#FFFFFF66] tabular-nums">{p.month}</span>
                            </span>
                            <span className="-mr-2 shrink-0">
                                <PhotoUgcButton photo={{ id: p.id, memberId: p.memberId, name: p.credit }} onBlocked={refresh} />
                            </span>
                        </figcaption>
                    </figure>
                ))}
            </div>
            {!all && photos.length > FIRST && (
                <button type="button" onClick={() => setAll(true)} className="mt-3 w-full h-11 rounded-xl bg-[#FFFFFF0A] text-[14px] font-medium text-[#FFFFFFCC] active:bg-[#FFFFFF14]">
                    사진 {photos.length - FIRST}장 더 보기
                </button>
            )}
            <p className="mt-3 text-[12px] text-[#FFFFFF59] break-keep">랭큐 회원이 공개한 라운드 사진이에요 · 문제가 있는 사진은 ⋯ 에서 신고해 주세요</p>
            <PhotoViewer photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} />
        </Section>
    );
}
