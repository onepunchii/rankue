/**
 * /golf/shelf — 골프 장식장(2026-10-12). 볼마커 수집함 + 엘리트 트로피.
 *
 * 볼마커는 도장첩 한 권을 다 채우면 하나(권 아홉 + 누구나 일곱 권 전부 = 열 칸), 트로피는 찍은 엘리트 골프장 수(10 · 20 · 30 · 45 · 전부).
 * 못 받은 것도 윤곽이 보인다 — 무엇이 남았는지 알아야 모으고 싶어진다.
 * 당구의 장식장(온라인게임의 메달 · 등급 배지)과는 다른 물건이다 — 당구 배지를 여기에 섞지 않는다.
 *
 * 로그인 없이 열린다. 방문자에게는 **다 모았을 때의 장식장**을 예시로 보여 준다(2026-10-12 오너: "볼마커 장식장 예시는 다 획득했다라는
 * 예시가 좋을 거 같은데") — 볼마커 열 개 · 트로피 다섯 개가 다 놓인 모습. 회원은 늘 내 장식장이고, 그 예시는 '?' 단추가 연다(StampHelp).
 * ⚠️ 리터럴 색만(StampParts 머리말).
 */
import { useState } from "react";
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { STAMP_ALL_OPEN, STAMP_BOOKS, STAMP_TROPHY_STEPS } from "@shared/golfStampBooks";
import { GOLF_PINS, golfPin } from "@shared/golfPins";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { Skel } from "@/golf/components/course/detail/ui";
import { StampHelpButton, StampHelpSheet } from "@/golf/stamps/StampHelp";
import { TROPHIES } from "@/golf/stamps/bookArt";
import { awardLabel, awardWhen, useStampAwards } from "@/golf/stamps/useStampAwards";
import { useStampCollection } from "@/golf/stamps/useStampCollection";
import { PinCase, PinPiece } from "@/golf/stamps/PinParts";
import { MarkerArt, MarkerCase, SHELF_PATH, STAMPS_PATH, SampleJoin, SampleNotice, StampBar, StampSection, TrophyShelf, bookName, bookPath } from "@/golf/stamps/StampParts";
import { useSeo } from "@/hooks/useSeo";
import { stampShelfSeo } from "@shared/golfStampGuide";

export default function GolfShelf() {
    const col = useStampCollection({ guest: "full" });
    const { states, summary, sample } = col;
    const [help, setHelp] = useState(false);
    // 검색 · 공유의 제목과 설명 — 검색용 화면(server/seo/golfStamps)과 같은 글
    const seo = stampShelfSeo();
    useSeo({ title: seo.title, description: seo.desc, path: seo.path });
    // 받은 기록(몇 번째 · 받은 날) — 회원의 것만. 방문자의 예시 장식장에는 붙이지 않는다
    const awards = useStampAwards();
    const lastStep = STAMP_TROPHY_STEPS[STAMP_TROPHY_STEPS.length - 1];
    // 볼마커는 권마다 하나 + 누구나 일곱 권 전부
    const markerTotal = STAMP_BOOKS.length + 1;
    // 업적 핀 — 회원은 받은 기록(서버가 라운드를 끝낼 때 적는다)으로, 예시는 다 받은 모습으로
    const pinGot = (id: string) => sample || !!awards.of("pin", id);
    const pinCount = GOLF_PINS.filter((p) => pinGot(p.id)).length;

    return (
        <CourseShell title="골프 장식장" backTo={STAMPS_PATH} hideBottomCta right={<StampHelpButton onClick={() => setHelp(true)} />}>
            <StampHelpSheet open={help} onOpenChange={setHelp} />
            {col.isLoading ? (
                <div className="px-5 pt-6 space-y-4" aria-busy="true"><Skel className="h-16" /><Skel className="h-56" /><Skel className="h-40" /></div>
            ) : (
                <div className="pb-10" data-testid="golf-shelf" data-sample={sample ? "1" : "0"}>
                    <div className="px-5 pt-5">
                        <SampleNotice col={col} text="다 모았을 때의 장식장을 예시로 보여 드려요. 도장첩 한 권을 다 채울 때마다 볼마커가 하나씩 놓여요." />
                    </div>

                    <div className="px-5 pt-4">
                        <div className="flex rounded-2xl bg-[#FFFFFF0A] border border-[#FFFFFF14] py-3.5" data-testid="shelf-summary">
                            {([[summary.markers, `볼마커 · ${markerTotal}`], [summary.trophies, `트로피 · ${STAMP_TROPHY_STEPS.length}`], [pinCount, `핀 · ${GOLF_PINS.length}`], [summary.stamped, `도장 · ${summary.total}`]] as const).map(([n, label]) => (
                                <div key={label} className="flex-1 text-center">
                                    <div className="text-[24px] font-semibold tabular-nums leading-none text-[#FFFFFF]">{n}</div>
                                    <div className="mt-1.5 text-[12px] text-[#FFFFFF8C]">{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <StampSection title="볼마커 수집함" sample={sample} aside="도장첩을 다 채우면 한 개">
                        <MarkerCase states={states} summary={summary} />
                        {summary.nearest && (
                            <Link href={bookPath(summary.nearest.bookId)} className="mt-3 flex items-center gap-1 text-[14px] text-[#FFFFFFB3] active:text-[#FFFFFF]" data-testid="shelf-nearest">
                                <span className="flex-1 break-keep">다음 볼마커는 {bookName(summary.nearest.bookId)} — {summary.nearest.left}곳 남았어요</span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                            </Link>
                        )}
                    </StampSection>

                    <StampSection title="엘리트 트로피" sample={sample} aside="찍은 엘리트 골프장 수">
                        <TrophyShelf stamped={summary.stamped} />
                        <div className="mt-3" data-testid="shelf-next-trophy">
                            {summary.nextTrophy ? (
                                <>
                                    <div className="flex items-baseline justify-between text-[13px] text-[#FFFFFFB3]">
                                        <span className="break-keep">다음 트로피까지 {summary.nextTrophy.left}곳</span>
                                        <span className="tabular-nums">{summary.stamped} / {summary.nextTrophy.at === lastStep ? "전부" : summary.nextTrophy.at}</span>
                                    </div>
                                    <StampBar got={summary.stamped} total={summary.nextTrophy.at} className="mt-2" />
                                </>
                            ) : (
                                <p className="text-[13px] text-[#FFD36B]">엘리트 골프장을 전부 찍었어요.</p>
                            )}
                        </div>
                    </StampSection>

                    {/* 업적 핀 — 골프장을 새로 가지 않아도 라운드를 쌓으면 붙는다(shared/golfPins). 못 받은 핀은 조건이 보인다 */}
                    <StampSection title="업적 핀" sample={sample} aside="라운드를 쌓으면 붙어요">
                        <PinCase earned={pinGot} when={sample ? undefined : (id) => { const a = awards.of("pin", id); return a ? awardWhen(a) : undefined; }} />
                        <p className="mt-2.5 text-[12.5px] leading-snug text-[#FFFFFF73] break-keep">골프장에서 끝낸 라운드만 세요. 타수 핀은 정규 18홀(총 파 68 이상)에서, 버디 · 이글은 파를 아는 홀에서 붙어요.</p>
                    </StampSection>

                    {!sample && awards.list.length > 0 && (
                        <StampSection title="받은 기록" aside="받은 순번 · 받은 날">
                            <ul className="rounded-2xl bg-[#FFFFFF08]" data-testid="shelf-awards">
                                {awards.list.map((a, i) => (
                                    <li key={a.id} className={`flex items-center gap-3 px-3.5 py-2.5${i ? " border-t border-[#FFFFFF0F]" : ""}`}>
                                        {a.kind === "pin"
                                            ? <span className="flex h-10 w-10 shrink-0 items-center justify-center">{golfPin(a.key) && <PinPiece pin={{ ...golfPin(a.key)!, num: undefined }} earned size={38} />}</span>
                                            : a.kind === "trophy"
                                            ? <img src={TROPHIES.find((t) => String(t.at) === a.key)?.src ?? TROPHIES[0].src} alt="" width={40} height={40} className="h-10 w-10 shrink-0" loading="lazy" decoding="async" draggable={false} />
                                            : <span className="flex h-10 w-10 shrink-0 items-center justify-center"><MarkerArt bookId={a.kind === "all" ? STAMP_ALL_OPEN : a.key} size={36} earned /></span>}
                                        <span className="min-w-0 flex-1 text-[14px] text-[#FFFFFF] break-keep">{awardLabel(a.kind, a.key)}</span>
                                        <span className="shrink-0 text-[13px] tabular-nums text-[#FFFFFF99]">{awardWhen(a)}</span>
                                    </li>
                                ))}
                            </ul>
                        </StampSection>
                    )}

                    <SampleJoin col={col} from={SHELF_PATH} className="pt-7" />

                    <div className="px-5 pt-8">
                        <Link href={STAMPS_PATH} className="flex h-12 items-center justify-center rounded-xl bg-[#64DD17] text-[15px] font-semibold text-[#051907] active:bg-[#58C614]">
                            도장첩 책장 보기
                        </Link>
                    </div>
                </div>
            )}
        </CourseShell>
    );
}
