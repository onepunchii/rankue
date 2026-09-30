/**
 * 도장깨기 → 앨범(2026-09-30 오너: "앨범을 넣어서 메뉴가 3개가 되어도 좋고").
 *
 * 내 라운드 사진(동반자가 올린 것 포함, 차단한 회원 것은 빼고 — useMyPhotos)을 **골프장마다** 묶는다.
 *  - 묶음 머리의 번호는 발자국 지도와 **같은 번호**(전체 기간, 처음 간 순서) — 이 사진이 몇 번째 걸음인지 바로 읽힌다.
 *    가장 최근 발자국은 주황(지도와 같은 색). 도장이 없는 라운드(18홀을 다 적지 않은 판 등)의 사진은 번호 없이 묶는다.
 *  - 묶음 순서는 **최근 라운드부터** — 앨범은 요즘 추억이 먼저 보여야 한다. 묶음 안은 찍은 순서.
 *  - 사진과 발자국은 골프장 이름으로 잇는다(규칙·테스트는 albumGroups.ts).
 *  - 누르면 기존 PhotoViewer — 내 사진 공개/지우기, 남의 사진 신고·차단이 그대로 된다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useMemo, useState } from "react";
import { LucideGlobe } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useMyPhotos } from "../../lib/photoApi";
import { PhotoViewer } from "../photos/PhotoViewer";
import { toViewer } from "../photos/RoundPhotoCamera";
import { useFootprints } from "./useFootprints";
import { StopBadge } from "./StopBadge";
import { GhostSteps } from "./GhostSteps";
import { groupByCourse } from "./albumGroups";

/** 한 묶음에 보이는 칸 — 넘으면 마지막 칸에 +N(눌러서 뷰어로 이어 본다) */
const SHOW = 6;

export function PassportAlbum() {
    const photosQ = useMyPhotos();
    const fp = useFootprints(null);
    const [open, setOpen] = useState<{ key: string; index: number } | null>(null);
    const groups = useMemo(() => groupByCourse(photosQ.data ?? [], fp.data?.stops ?? []), [photosQ.data, fp.data]);
    const total = photosQ.data?.length ?? 0;
    const mine = (photosQ.data ?? []).some((p) => p.mine);
    const openGroup = open ? groups.find((g) => g.key === open.key) : null;
    const viewerPhotos = useMemo(() => (openGroup ? openGroup.photos.map(toViewer) : []), [openGroup]);

    return (
        <section className="mb-8" aria-label="라운드 앨범">
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-[20px] font-bold tracking-tight text-[#ffffff]">라운드 앨범</h2>
                    <p className="mt-0.5 text-[13px] text-[#FFFFFF8C]">골프장마다 모아 봤어요 · 최근 라운드부터</p>
                </div>
                {total > 0 && <span className="shrink-0 pb-0.5 text-[13px] text-[#FFFFFF59] tabular-nums">{total >= 60 ? "최근 60장" : `${total}장`}</span>}
            </div>

            {photosQ.isPending ? (
                <div className="mt-4 space-y-3" aria-hidden="true">
                    <div className="h-12 rounded-2xl bg-[#FFFFFF08] animate-pulse" />
                    <div className="grid grid-cols-3 gap-1.5">
                        {[0, 1, 2].map((i) => <div key={i} className="aspect-square rounded-xl bg-[#FFFFFF08] animate-pulse" />)}
                    </div>
                </div>
            ) : photosQ.isError ? (
                <p className="mt-6 text-center text-[13px] text-[#FFFFFF73]">사진을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
            ) : groups.length === 0 ? (
                <div className="mt-4 rounded-3xl bg-[#FFFFFF06] ring-1 ring-inset ring-[#FFFFFF0F] px-6 pt-8 pb-9 flex flex-col items-center text-center">
                    <GhostSteps goal="photo" />
                    <p className="mt-3 text-[16px] font-semibold text-[#ffffff]">아직 앨범이 비어 있어요</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#FFFFFFA6] break-keep">라운드 중 📷 버튼으로 첫 추억을 남겨 보세요</p>
                </div>
            ) : (
                <div className="mt-4 space-y-3">
                    {groups.map((g) => {
                        const more = g.photos.length - SHOW;
                        return (
                            <article key={g.key} className="rounded-3xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] p-3.5">
                                <header className="flex items-center gap-3 px-0.5">
                                    <StopBadge n={g.n} latest={g.latest} size={30} />
                                    <div className="flex-1 min-w-0">
                                        <p className="flex items-center gap-1.5 min-w-0">
                                            <span className="text-[15.5px] font-semibold text-[#ffffff] truncate">{g.name}</span>
                                            {g.latest && <span className="shrink-0 h-5 px-1.5 rounded-md bg-[#FF8A3D26] text-[#FFB27A] text-[11.5px] font-semibold leading-5">최근</span>}
                                        </p>
                                        <p className="mt-0.5 text-[12.5px] text-[#FFFFFF73] tabular-nums truncate">
                                            {g.days[0]}{g.days.length > 1 ? ` 외 ${g.days.length - 1}번` : ""} · 사진 {g.photos.length}장
                                        </p>
                                    </div>
                                </header>
                                <div className="mt-3 grid grid-cols-3 gap-1.5">
                                    {g.photos.slice(0, SHOW).map((p, i) => {
                                        const last = i === SHOW - 1 && more > 0;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setOpen({ key: g.key, index: i })}
                                                aria-label={last ? `사진 ${more + 1}장 더 보기` : `${g.name} ${p.holeNo ? `${p.holeNo}번 홀 ` : ""}사진 · ${p.mine ? "나" : p.uploaderName}`}
                                                className="relative aspect-square rounded-xl overflow-hidden bg-[#FFFFFF0A] active:opacity-80"
                                            >
                                                <img src={p.thumbUrl} alt="" loading="lazy" className={cn("w-full h-full object-cover", p.hidden && "opacity-40")} />
                                                {!last && p.holeNo != null && (
                                                    <span className="absolute left-1.5 bottom-1.5 h-[20px] px-1.5 rounded-md bg-[#000000A6] text-[12px] font-medium leading-[20px] text-[#ffffff] tabular-nums">{p.holeNo}번 홀</span>
                                                )}
                                                {!last && p.mine && p.isPublic && (
                                                    <span className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-[#000000A6] flex items-center justify-center" aria-label="골프장 페이지에 공개">
                                                        <LucideGlobe className="w-3.5 h-3.5 text-[#9BEF5C]" />
                                                    </span>
                                                )}
                                                {!last && p.hidden && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[12px] font-semibold text-[#FF8A8C]">가려짐</span>}
                                                {last && (
                                                    <span className="absolute inset-0 bg-[#000000A6] flex items-center justify-center text-[16px] font-semibold text-[#ffffff] tabular-nums">+{more + 1}</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </article>
                        );
                    })}
                    {mine && (
                        <p className="px-1 text-[12.5px] leading-relaxed text-[#FFFFFF66] break-keep">
                            내 사진은 기본으로 나와 동반자만 봐요 · 사진을 눌러 골프장 페이지 공개를 켜고 끌 수 있어요
                        </p>
                    )}
                </div>
            )}

            <PhotoViewer photos={viewerPhotos} index={openGroup ? open!.index : null} onClose={() => setOpen(null)} />
        </section>
    );
}
