/**
 * /hiking/stamps — 등산 도장첩 책장(2026-10-13 오너: "산은 각 지역으로 묶어도 되고 특성으로 묶고 다양한 스탬프를 받을 수 있게").
 *
 * 도장첩 네 줄: 산림청 100대 명산(권역 여덟 권) · 철 따라 가는 산(철쭉 · 단풍 · 억새 · 눈꽃) · 특성으로 묶은 산(국립공원 · 하늘 가까운 산 · 높은 산 50 · 섬 · 도립공원)
 * · 명산 플러스(권역). 맨 위에는 내 산행 등급(shared/hikingGrade).
 * 한 산이 여러 권에 든다 — 설악산 하나로 여러 권의 칸이 같이 찬다. 한 권을 다 채우면 와펜을 받아 배낭에 단다.
 *
 * 누구에게나 열린다. 등산을 쓸 수 있는 회원은 내 진행을, 그 밖의 사람은 받을 수 있는 와펜을 제 색으로 본다.
 * 예시(2026-10-13 오너: "등산에 도장첩 예시 만들어줘 — 수집욕이 올라가게. 골프는 예시 버튼을 잘 활용하는데 등산은 부족하네"):
 *   머리줄의 '예시' 단추(또는 도장이 없는 회원 · 방문자에게 보이는 카드)를 누르면 주소에 ?example=1 이 붙고 **다 모은 모습**으로 바뀐다 —
 *   모든 권이 채워지고 와펜이 제 색으로 달리고 산행 등급이 맨 위에 선다. 누구의 기록도 아니라 산의 목록에서 만든 것이라(shared/hikingStampExample)
 *   화면 맨 위에 '예시'라고 적고, 내 사진첩으로 가는 길은 그리지 않는다. 등급 · 요약을 누르면 예시 배낭(와펜 · 핀을 다 단 모습)으로 간다. 뒤로 가면 내 도장첩이다.
 * 회원에게는 맨 위 요약 밑에 '내 사진첩'의 입구가 놓인다(album/AlbumParts AlbumEntry — 산마다 올린 내 사진을 한 곳에서 본다).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { Link, useLocation, useSearch } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { HIKING_STAMPS_INTRO, HIKING_STAMPS_SEO } from "@shared/hikingPage";
import { HIKING_GRANDS, HIKING_PINS, HIKING_SERIES, type HikingBookKind } from "@shared/hikingStamps";
import { HIKING_EXAMPLE_COPY as EX, isHikingExample, withHikingExample } from "@shared/hikingStampExample";
import { AlbumEntry } from "../album/AlbumParts";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { GradeCard } from "../stamps/GradeParts";
import { BookRow, HIKING_PACK_PATH, HIKING_STAMPS_PATH, PatchArt } from "../stamps/StampParts";
import { useHikingStamps } from "../stamps/useHikingStamps";

const SERIES: readonly HikingBookKind[] = ["kfs", "season", "theme", "plus"];

export default function StampShelf() {
    const example = isHikingExample(useSearch());
    const [, setLocation] = useLocation();
    const s = useHikingStamps({ example });
    useSeo({ title: HIKING_STAMPS_SEO.title, description: HIKING_STAMPS_SEO.desc, path: HIKING_STAMPS_SEO.path });
    const got = s.stamps.filter((x) => x.verified).length;
    // 예시에서는 받은 것이 '전부'다 — 권마다의 와펜 + 큰 와펜, 핀 전부(순번은 만들지 않으므로 받은 기록 대신 목록의 수를 센다)
    const patches = example ? s.states.length + HIKING_GRANDS.length : s.awards.filter((a) => a.kind === "patch" || a.kind === "grand").length;
    const pins = example ? HIKING_PINS.length : s.awards.filter((a) => a.kind === "pin").length;
    const openExample = () => setLocation(withHikingExample(HIKING_STAMPS_PATH));
    // 도장이 아직 없는 회원 — 내 도장첩(빈 칸)은 그대로 두고, 다 모은 모습으로 가는 한 줄을 맨 위에
    const fresh = s.member && !example && !s.isLoading && got === 0;
    const summaryRow = ([[got, "오른 산"], [patches, "와펜"], [pins, "핀"]] as const).map(([n, label]) => (
        <div key={label} className="flex-1 text-center">
            <div className="text-[24px] font-semibold tabular-nums leading-none text-[#F4EFE3]">{n}</div>
            <div className="mt-1.5 text-[12px] text-[#F4EFE38C]">{label}</div>
        </div>
    ));

    return (
        <HikingShell title={example ? "도장첩 예시" : "도장첩"} backTo={example ? HIKING_STAMPS_PATH : "/hiking"}
            right={example ? undefined : (
                <button type="button" onClick={openExample} className="h-8 rounded-full bg-[#F6D9A8] px-3 text-[13px] font-semibold text-[#2A1208] active:opacity-80" data-testid="hk-example-btn" data-track-as="hiking-stamp-example">{EX.button}</button>
            )}>
            <div data-testid="hk-stamp-shelf" data-mine={s.mine ? "1" : "0"} data-example={example ? "1" : "0"}>
                {s.isLoading ? (
                    <div className="space-y-3 px-5 pt-6" aria-busy="true"><HkSkel className="h-20" /><HkSkel className="h-24" /><HkSkel className="h-24" /></div>
                ) : (
                    <>
                        <div className="px-5 pt-5">
                            {/* 예시의 띠 — 누구의 기록도 아니라는 것부터. 내 도장첩으로 돌아가는 길을 같이 둔다 */}
                            {example && (
                                <div className="mb-3 flex items-center gap-3 rounded-2xl bg-[#F6D9A81F] px-3.5 py-3" style={{ boxShadow: "inset 0 0 0 1px #F6D9A866" }} data-testid="hk-example-banner" role="note">
                                    <span className="shrink-0 rounded-full bg-[#F6D9A8] px-2 py-0.5 text-[12px] font-semibold text-[#2A1208]">{EX.chip}</span>
                                    <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-[#F4EFE3] break-keep">{EX.banner}</p>
                                    <Link href={HIKING_STAMPS_PATH} replace className="shrink-0 text-[13px] text-[#F6D9A8] underline underline-offset-2" data-testid="hk-example-exit">{s.member ? EX.exit : EX.exitGuest}</Link>
                                </div>
                            )}
                            {fresh && (
                                <button type="button" onClick={openExample} className="mb-2.5 flex w-full items-center gap-3 rounded-2xl bg-[#F6D9A814] px-3.5 py-3 text-left active:bg-[#F6D9A824]" style={{ boxShadow: "inset 0 0 0 1px #F6D9A859" }} data-testid="hk-example-fresh" data-track-as="hiking-stamp-example-fresh">
                                    <PatchArt art={HIKING_GRANDS[0].art} size={46} earned />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15px] font-semibold text-[#F4EFE3] break-keep">{EX.freshTitle}</span>
                                        <span className="mt-0.5 block text-[13px] text-[#F4EFE399] break-keep">{EX.freshSub}</span>
                                    </span>
                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F6D9A8]" aria-hidden />
                                </button>
                            )}
                            {/* 등급 · 요약을 누르면 배낭으로 — 예시에서는 예시 배낭으로(와펜 · 핀을 다 단 모습) */}
                            {s.mine && <Link href={example ? withHikingExample(HIKING_PACK_PATH) : HIKING_PACK_PATH} className="mb-2.5 block active:opacity-80" data-testid="hk-shelf-grade"><GradeCard state={s.grade} /></Link>}
                            {s.mine ? (
                                <Link href={example ? withHikingExample(HIKING_PACK_PATH) : HIKING_PACK_PATH} className="flex items-center rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF0A] py-3.5 active:bg-[#FFFFFF14]" data-testid="hk-stamp-summary">
                                    {summaryRow}
                                    <span className="mr-3 flex items-center gap-0.5 text-[13px] text-[#F6D9A8]">배낭<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden /></span>
                                </Link>
                            ) : (
                                <>
                                    <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-3.5 text-[14px] leading-relaxed text-[#F4EFE3CC] break-keep" data-testid="hk-stamp-intro">{HIKING_STAMPS_INTRO}</p>
                                    {/* 방문자 — 다 모은 모습으로 가는 큰 입구 */}
                                    <button type="button" onClick={openExample} className="mt-2.5 flex w-full items-center gap-3.5 rounded-2xl bg-[#F6D9A814] px-3.5 py-3.5 text-left active:bg-[#F6D9A824]" style={{ boxShadow: "inset 0 0 0 1px #F6D9A859" }} data-testid="hk-example-guest" data-track-as="hiking-stamp-example-guest">
                                        <span className="relative h-[58px] w-[84px] shrink-0">
                                            <PatchArt art={HIKING_GRANDS[1].art} size={52} earned className="absolute left-0 top-1.5" />
                                            <PatchArt art={HIKING_GRANDS[0].art} size={58} earned className="absolute right-0 top-0" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[15.5px] font-semibold text-[#F4EFE3] break-keep">{EX.guestTitle}</span>
                                            <span className="mt-0.5 block text-[13px] leading-snug text-[#F4EFE399] break-keep">{EX.guestSub}</span>
                                        </span>
                                        <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F6D9A8]" aria-hidden />
                                    </button>
                                </>
                            )}
                            {/* 내 사진첩 — 등산을 쓰는 회원에게만(그 밖의 사람에게는 그려지지 않는다). 예시에는 두지 않는다(내 것이다) */}
                            {!example && <AlbumEntry from="shelf" className="mt-2.5" />}
                        </div>

                        {SERIES.map((kind) => {
                            const books = s.states.filter((x) => x.book.kind === kind);
                            if (books.length === 0) return null;
                            const grand = HIKING_GRANDS.find((g) => g.kind === kind);
                            // 큰 와펜 — 다 채웠거나 어드민이 증정했으면(2026-10-16 · 받은 기록)
                            const all = books.every((b) => b.done) || (!!grand && !!s.award("grand", grand.id));
                            return (
                                <HkSection key={kind} title={HIKING_SERIES[kind]} aside={`${books.length}권 · ${new Set(books.flatMap((b) => b.slots.map((x) => x.m.id))).size}곳`}>
                                    <ul className="space-y-2.5">
                                        {books.map((b) => <li key={b.book.id}><BookRow state={b} preview={!s.mine} example={example} /></li>)}
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

                        {!s.member && <div className="px-5 pt-8"><HikingCta /></div>}
                    </>
                )}
            </div>
        </HikingShell>
    );
}
