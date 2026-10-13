/**
 * /hiking/stamps/:book — 등산 도장첩 한 권(2026-10-13). 표지 · 다 채우면 받는 와펜 · 정상 도장의 칸(종이 위).
 *
 * 빈 칸은 산 이름과 함께 보인다 — 무엇이 남았는지 알아야 가고 싶어진다. 칸을 누르면 그 산의 화면(코스 · 날씨 · 정상 인증)으로 간다.
 * 인증 없이 적은 산은 흐린 도장으로 보이고 칸은 차지 않는다.
 * 도장 | 사진 — 이 권의 산에 내가 올린 사진이 한 장이라도 있으면 전환 단추가 생긴다(기본은 도장). 사진으로 보면 사진이 있는 칸은
 * 그 사진으로 바뀌고 내 사진첩의 그 산(/hiking/album?m=)으로 간다. 사진이 없는 칸은 도장을 흐리게 둔다.
 * 누구에게나 열린다(등산이 열리지 않은 사람에게는 빈 도장첩과 받을 와펜). ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { useMemo, useState } from "react";
import { useSearch, Link, useRoute } from "wouter";
import { HIKING_EXAMPLE_COPY as EX, isHikingExample, withHikingExample } from "@shared/hikingStampExample";
import { useSeo } from "@/hooks/useSeo";
import { duplicateNames, heightText, hikingMountainPath, mountainLabel } from "@shared/hikingMountains";
import { HIKING_ALBUM_LABEL, HIKING_ALBUM_PATH, albumPhotoCount, albumSlots, hikingAlbumMountainPath } from "@shared/hikingAlbum";
import { HIKING_SEASON_NAME } from "@shared/hikingStamps";
import { SlotPhoto } from "../album/AlbumParts";
import { useHikingAlbum } from "../album/useHikingAlbum";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { stampDate } from "../lib/date";
import { HIKING_STAMPS_PATH, HkBar, HkPaper, PatchArt } from "../stamps/StampParts";
import { SummitStamp, regionInk } from "../stamps/SummitStamp";
import { useHikingStamps } from "../stamps/useHikingStamps";
import { hikingCover, hikingListCover } from "../theme";

/** 손으로 찍은 것처럼 칸마다 조금씩 다른 기울기(도) */
const TILT = [-4, 3, -2, 5, -3, 2, -5, 4, -2, 3];

export default function StampBookPage() {
    const [, params] = useRoute("/hiking/stamps/:book");
    // 예시(?example=1) — 이 권을 다 채운 모습(shared/hikingStampExample). 책장의 예시에서 들어오면 이어진다
    const example = isHikingExample(useSearch());
    const s = useHikingStamps({ example });
    const state = s.states.find((x) => x.book.id === params?.book);
    // 도장 | 사진 — 기본은 도장. 사진은 내 사진첩의 자료(등산을 쓰는 회원만 받는다)
    const { album } = useHikingAlbum();
    const photoOf = useMemo(() => albumSlots(album), [album]);
    const [mode, setMode] = useState<"stamp" | "photo">("stamp");
    useSeo(state ? { title: `${state.book.name} 도장첩 — ${state.book.series} ${state.total}곳 | 랭큐 등산`, description: `${state.book.note}. 정상에서 인증하면 도장이 찍히고, 다 채우면 ${state.book.name} 와펜을 받아요.`, path: `${HIKING_STAMPS_PATH}/${state.book.id}` } : null);

    if (s.isLoading) return <HikingShell title="도장첩" backTo={HIKING_STAMPS_PATH}><div className="space-y-3 px-5 pt-6" aria-busy="true"><HkSkel className="h-44" /><HkSkel className="h-72" /></div></HikingShell>;
    if (!state) {
        return (
            <HikingShell title="도장첩" backTo={HIKING_STAMPS_PATH}>
                <div className="px-5 pt-16 text-center">
                    <p className="text-[15px] text-[#F4EFE3B3]">없는 도장첩이에요.</p>
                    <Link href={HIKING_STAMPS_PATH} className="mt-4 inline-flex h-11 items-center rounded-full bg-[#F28C6A] px-5 text-[14px] font-semibold text-[#2A1208]">도장첩 책장으로</Link>
                </div>
            </HikingShell>
        );
    }
    const { book, slots, got, total, done } = state;
    const award = s.award("patch", book.id);
    const records = slots.filter((x) => x.record).length;
    // 이 권의 산에 내 사진이 한 장이라도 있을 때만 전환 단추를 낸다
    const hasPhoto = s.member && !example && slots.some((x) => photoOf.has(x.m.id));
    const photoMode = hasPhoto && mode === "photo";
    const dup = duplicateNames(slots.map((y) => y.m));
    const seg = (active: boolean) => `flex h-9 min-w-[64px] items-center justify-center rounded-[10px] px-3.5 text-[13.5px] ${active ? "bg-[#F4EFE3] font-semibold text-[#0E2A33]" : "text-[#F4EFE3B3] active:bg-[#FFFFFF14]"}`;
    return (
        <HikingShell title={example ? `${book.name} 예시` : `${book.name} 도장첩`} backTo={example ? withHikingExample(HIKING_STAMPS_PATH) : HIKING_STAMPS_PATH}>
            <div data-testid="hk-stamp-book" data-book={book.id} data-mine={s.mine ? "1" : "0"} data-example={example ? "1" : "0"}>
                {example && (
                    <div className="px-5 pt-3">
                        <div className="flex items-center gap-3 rounded-2xl bg-[#F6D9A81F] px-3.5 py-2.5" style={{ boxShadow: "inset 0 0 0 1px #F6D9A866" }} data-testid="hk-example-banner" role="note">
                            <span className="shrink-0 rounded-full bg-[#F6D9A8] px-2 py-0.5 text-[12px] font-semibold text-[#2A1208]">{EX.chip}</span>
                            <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-[#F4EFE3] break-keep">{EX.bookBanner}</p>
                            <Link href={`${HIKING_STAMPS_PATH}/${book.id}`} replace className="shrink-0 text-[13px] text-[#F6D9A8] underline underline-offset-2" data-testid="hk-example-exit">{s.member ? EX.exit : EX.exitGuest}</Link>
                        </div>
                    </div>
                )}
                <div className="relative h-[176px] overflow-hidden">
                    <img src={book.region ? hikingCover(book.region) : hikingListCover(book.id)} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 55%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 20%,#0B1F26F5 97%)" }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-3.5">
                        <p className="text-[13px] text-[#F6D9A8]">{book.series}</p>
                        <h1 className="mt-0.5 text-[27px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{book.name}</h1>
                    </div>
                </div>

                {/* 다 채우면 받는 것 */}
                <div className="px-5 pt-4">
                    <div className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0A", boxShadow: done ? "inset 0 0 0 1px #F6D9A880" : "inset 0 0 0 1px #FFFFFF14" }} data-testid="hk-book-reward">
                        <PatchArt art={book.art} size={76} earned={done} preview={!s.mine} />
                        <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] text-[#F6D9A8] break-keep">{done ? (award ? `다 채워서 받은 와펜 · ${award.serial}번째 · ${stampDate(award.earnedAt)}` : "다 채워서 받은 와펜") : "다 채우면 받는 와펜"}</p>
                            <p className="mt-0.5 text-[16.5px] font-semibold text-[#F4EFE3] break-keep">{book.name} 와펜{s.mine && !done && <span className="ml-1.5 text-[13px] font-normal text-[#F4EFE399]">{total - got}곳 남음</span>}</p>
                            {s.mine ? <HkBar got={got} total={total} className="mt-2" /> : <p className="mt-1 text-[13px] text-[#F4EFE399] break-keep">{book.note}</p>}
                        </div>
                        {s.mine && <div className="text-[17px] font-semibold tabular-nums text-[#F4EFE3]">{got}<span className="text-[13px] font-normal text-[#F4EFE399]">/{total}</span></div>}
                    </div>
                </div>

                <HkSection title={`정상 도장 ${total}칸`} aside={photoMode ? HIKING_ALBUM_LABEL.bookPhotoAside : "정상에서 인증하면 찍혀요"}>
                    {hasPhoto && (
                        <div className="mb-3 flex justify-end">
                            <div role="tablist" aria-label="도장첩 보기" className="inline-flex gap-1 rounded-[13px] bg-[#FFFFFF14] p-1" data-testid="hk-book-mode" data-mode={photoMode ? "photo" : "stamp"}>
                                <button type="button" role="tab" aria-selected={!photoMode} onClick={() => setMode("stamp")} className={seg(!photoMode)} data-testid="hk-book-mode-stamp" data-track-as="hiking-album-book-stamp">{HIKING_ALBUM_LABEL.bookStamp}</button>
                                <button type="button" role="tab" aria-selected={photoMode} onClick={() => setMode("photo")} className={seg(photoMode)} data-testid="hk-book-mode-photo" data-track-as="hiking-album-book-photo">{HIKING_ALBUM_LABEL.bookPhoto}</button>
                            </div>
                        </div>
                    )}
                    <HkPaper className="px-2 pb-3.5 pt-4">
                        <div className="grid grid-cols-3 gap-x-1 gap-y-4">
                            {slots.map((x, i) => {
                                const st = x.stamp ?? x.record;
                                const photo = photoMode ? photoOf.get(x.m.id) : undefined;
                                // 사진으로 볼 때 — 내 사진이 있는 칸은 그 사진으로(같은 자리 · 같은 비율), 내 사진첩의 그 산으로 간다
                                if (photo) {
                                    return (
                                        <Link key={x.m.id} href={hikingAlbumMountainPath(photo.slug)} className="flex min-w-0 flex-col items-center gap-1 text-center active:opacity-70" data-testid={`hk-slot-${x.m.slug}`} data-state={x.stamp ? "on" : x.record ? "record" : "empty"} data-photo="1" data-track-as="hiking-album-slot">
                                            <div className="w-full max-w-[96px] px-1"><SlotPhoto slot={photo} tilt={TILT[i % TILT.length] / 2} /></div>
                                            <span className="text-[13px] font-semibold leading-tight text-[#0E2A33] break-keep">{mountainLabel(x.m, dup)}</span>
                                            <span className="text-[12px] tabular-nums text-[#8A5E00]">{albumPhotoCount(photo.count)}</span>
                                        </Link>
                                    );
                                }
                                return (
                                    <Link key={x.m.id} href={hikingMountainPath(x.m.slug)} className="flex flex-col items-center gap-1 text-center active:opacity-70" data-testid={`hk-slot-${x.m.slug}`} data-state={x.stamp ? "on" : x.record ? "record" : "empty"} data-photo="0">
                                        <div className="w-full max-w-[96px] px-1" style={photoMode ? { opacity: 0.4 } : undefined}>
                                            <SummitStamp name={x.m.name} heightM={x.m.heightM} ink={regionInk(x.m.region)} date={st ? stampDate(new Date(st.firstAt)) : null} state={x.stamp ? "on" : x.record ? "faded" : "empty"} tilt={x.stamp ? TILT[i % TILT.length] : 0} />
                                        </div>
                                        <span className="text-[13px] leading-tight break-keep" style={{ color: x.stamp ? "#0E2A33" : "#0E2A3399", fontWeight: x.stamp ? 600 : 400 }}>{mountainLabel(x.m, dup)}</span>
                                        {x.stamp
                                            ? <span className="text-[12px] text-[#8A5E00]">{x.stamp.seasons.map((k) => HIKING_SEASON_NAME[k]).join(" · ")}{x.stamp.count > 1 ? ` · ${x.stamp.count}번` : ""}</span>
                                            : x.record
                                                ? <span className="text-[12px] text-[#8A5E00]">인증 없는 기록</span>
                                                : <span className="text-[12px] tabular-nums text-[#0E2A3380]">{heightText(x.m.heightM)}</span>}
                                    </Link>
                                );
                            })}
                        </div>
                    </HkPaper>
                    {photoMode && (
                        <Link href={HIKING_ALBUM_PATH} className="mt-3 flex h-12 items-center justify-center rounded-xl bg-[#FFFFFF14] text-[14.5px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]" data-testid="hk-book-album" data-track-as="hiking-album-entry-book">{HIKING_ALBUM_LABEL.title} 전체 보기</Link>
                    )}
                    {!photoMode && records > 0 && <p className="mt-2.5 text-[13px] leading-snug text-[#F4EFE38C] break-keep">흐린 도장은 인증 없이 적은 기록이에요. 정상에서 인증하면 또렷한 도장으로 바뀌어요.</p>}
                    {!photoMode && <p className="mt-2.5 text-[13px] leading-snug text-[#F4EFE38C] break-keep">다른 철에 다시 오르면 그 철이 도장 밑에 쌓여요.</p>}
                </HkSection>

                {!s.member && <div className="px-5 pt-8"><HikingCta /></div>}
            </div>
        </HikingShell>
    );
}
