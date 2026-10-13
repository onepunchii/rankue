/**
 * /hiking/stamps — 등산 도장첩 책장(2026-10-13 오너: "산은 각 지역으로 묶어도 되고 특성으로 묶고 다양한 스탬프를 받을 수 있게").
 *
 * 도장첩 네 줄: 산림청 100대 명산(권역 여덟 권) · 철 따라 가는 산(철쭉 · 단풍 · 억새 · 눈꽃) · 특성으로 묶은 산(국립공원 · 하늘 가까운 산 · 높은 산 50 · 섬 · 도립공원)
 * · 명산 플러스(권역). 맨 위에는 내 산행 등급(shared/hikingGrade).
 * 한 산이 여러 권에 든다 — 설악산 하나로 여러 권의 칸이 같이 찬다. 한 권을 다 채우면 와펜을 받아 배낭에 단다.
 *
 * 누구에게나 열린다. 등산을 쓸 수 있는 회원은 내 진행을, 그 밖의 사람은 받을 수 있는 와펜을 제 색으로 본다(지어낸 예시는 그리지 않는다).
 * 회원에게는 맨 위 요약 밑에 '내 사진첩'의 입구가 놓인다(album/AlbumParts AlbumEntry — 산마다 올린 내 사진을 한 곳에서 본다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { HIKING_STAMPS_INTRO, HIKING_STAMPS_SEO } from "@shared/hikingPage";
import { HIKING_GRANDS, HIKING_SERIES, type HikingBookKind } from "@shared/hikingStamps";
import { AlbumEntry } from "../album/AlbumParts";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { GradeCard } from "../stamps/GradeParts";
import { BookRow, HIKING_PACK_PATH, PatchArt } from "../stamps/StampParts";
import { useHikingStamps } from "../stamps/useHikingStamps";

const SERIES: readonly HikingBookKind[] = ["kfs", "season", "theme", "plus"];

export default function StampShelf() {
    const s = useHikingStamps();
    useSeo({ title: HIKING_STAMPS_SEO.title, description: HIKING_STAMPS_SEO.desc, path: HIKING_STAMPS_SEO.path });
    const got = s.stamps.filter((x) => x.verified).length;
    const patches = s.awards.filter((a) => a.kind === "patch" || a.kind === "grand").length;
    const pins = s.awards.filter((a) => a.kind === "pin").length;

    return (
        <HikingShell title="도장첩" backTo="/hiking">
            <div data-testid="hk-stamp-shelf" data-mine={s.mine ? "1" : "0"}>
                {s.isLoading ? (
                    <div className="space-y-3 px-5 pt-6" aria-busy="true"><HkSkel className="h-20" /><HkSkel className="h-24" /><HkSkel className="h-24" /></div>
                ) : (
                    <>
                        <div className="px-5 pt-5">
                            {s.mine && <Link href={HIKING_PACK_PATH} className="mb-2.5 block active:opacity-80" data-testid="hk-shelf-grade"><GradeCard state={s.grade} /></Link>}
                            {s.mine ? (
                                <Link href={HIKING_PACK_PATH} className="flex items-center rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF0A] py-3.5 active:bg-[#FFFFFF14]" data-testid="hk-stamp-summary">
                                    {([[got, "오른 산"], [patches, "와펜"], [pins, "핀"]] as const).map(([n, label]) => (
                                        <div key={label} className="flex-1 text-center">
                                            <div className="text-[24px] font-semibold tabular-nums leading-none text-[#F4EFE3]">{n}</div>
                                            <div className="mt-1.5 text-[12px] text-[#F4EFE38C]">{label}</div>
                                        </div>
                                    ))}
                                    <span className="mr-3 flex items-center gap-0.5 text-[13px] text-[#F6D9A8]">배낭<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden /></span>
                                </Link>
                            ) : (
                                <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-3.5 text-[14px] leading-relaxed text-[#F4EFE3CC] break-keep" data-testid="hk-stamp-intro">{HIKING_STAMPS_INTRO}</p>
                            )}
                            {/* 내 사진첩 — 등산을 쓰는 회원에게만(그 밖의 사람에게는 그려지지 않는다) */}
                            <AlbumEntry from="shelf" className="mt-2.5" />
                        </div>

                        {SERIES.map((kind) => {
                            const books = s.states.filter((x) => x.book.kind === kind);
                            if (books.length === 0) return null;
                            const grand = HIKING_GRANDS.find((g) => g.kind === kind);
                            const all = books.every((b) => b.done);
                            return (
                                <HkSection key={kind} title={HIKING_SERIES[kind]} aside={`${books.length}권 · ${new Set(books.flatMap((b) => b.slots.map((x) => x.m.id))).size}곳`}>
                                    <ul className="space-y-2.5">
                                        {books.map((b) => <li key={b.book.id}><BookRow state={b} preview={!s.mine} /></li>)}
                                    </ul>
                                    {grand && (
                                        <div className="mt-3 flex items-center gap-3.5 rounded-2xl px-3.5 py-3" style={{ background: all ? "#F6D9A81F" : "#FFFFFF0A", boxShadow: all ? "inset 0 0 0 1px #F6D9A866" : "inset 0 0 0 1px #FFFFFF14" }} data-testid={`hk-grand-${grand.id}`}>
                                            <PatchArt art={grand.art} size={64} earned={all} preview={!s.mine} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[15.5px] font-semibold text-[#F4EFE3]">{grand.name}</p>
                                                <p className="mt-0.5 text-[13px] text-[#F4EFE399] break-keep">{grand.how} 채우면 받는 큰 와펜</p>
                                            </div>
                                        </div>
                                    )}
                                </HkSection>
                            );
                        })}

                        {!s.mine && <div className="px-5 pt-8"><HikingCta /></div>}
                    </>
                )}
            </div>
        </HikingShell>
    );
}
