/**
 * /hiking/pack — 배낭(2026-10-13). 등산의 '모아 두는 곳': 산행 등급 · 산 와펜 · 도장첩 와펜 · 핀.
 *
 * 당구의 장식장(메달 · 방패) · 골프의 볼마커 수집함과는 다른 물건이다 — 등산하는 사람이 실제로 배낭에 다는 것(와펜 · 핀).
 *   산행 등급   정상에서 인증한 서로 다른 산의 수로 오른다(들머리 → 하늘금, shared/hikingGrade). 삼각 휘장 여덟.
 *   산 와펜     산림청 100대 명산 한 곳마다 한 장 — 그 산의 정상에서 인증하면 제 색이 된다. 권역별로 늘어놓는다.
 *   도장첩 와펜 도장첩 한 권을 다 채우면 한 장(권역 · 철 · 특성). 배낭 덮개에 단다.
 *   핀          산행을 쌓으면 붙는다.
 * 못 받은 것은 흐린 윤곽과 조건이 보인다. 받은 것에는 받은 순번과 날.
 * 누구에게나 열린다(등산이 열리지 않은 사람에게는 받을 수 있는 것을 제 색으로). ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { Link } from "wouter";
import { useSeo } from "@/hooks/useSeo";
import { HIKING_GRADES, type HikingGradeId } from "@shared/hikingGrade";
import { HIKING_REGIONS, duplicateNames, hikingMountainPath, mountainLabel } from "@shared/hikingMountains";
import { HIKING_GRADE_NOTE, HIKING_PACK_INTRO, HIKING_PACK_LABEL, HIKING_PACK_SEO, HIKING_PIN_NOTE, MOUNTAIN_PATCH_NOTE } from "@shared/hikingPage";
import { HIKING_GRANDS, HIKING_PINS } from "@shared/hikingStamps";
import { AlbumEntry } from "../album/AlbumParts";
import { HikingShell, HkSection, HkSkel } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { stampDate } from "../lib/date";
import { GradeCard, GradeLadder } from "../stamps/GradeParts";
import { MountainPatch } from "../stamps/MountainPatch";
import { HIKING_STAMPS_PATH, PatchArt, PinArt, hikingBookPath } from "../stamps/StampParts";
import { useHikingStamps } from "../stamps/useHikingStamps";
import { YearReport } from "../components/YearReport";

export default function PackPage() {
    const s = useHikingStamps();
    useSeo({ title: HIKING_PACK_SEO.title, description: HIKING_PACK_SEO.desc, path: HIKING_PACK_SEO.path });
    const got = s.stamps.filter((x) => x.verified).length;
    const patchN = s.states.filter((x) => x.done).length + HIKING_GRANDS.filter((g) => s.award("grand", g.id)).length;
    const kfs = s.famous.filter((m) => m.lists.includes("kfs100"));
    const kfsGot = kfs.filter((m) => s.done.has(m.id)).length;
    // 100대 명산에는 같은 이름의 산이 있다(지리산 둘 · 백운산 셋) — 시군을 붙여 가른다
    const dup = duplicateNames(kfs);
    const gradeOn = (id: HikingGradeId) => { const a = s.award("grade", id); return a ? stampDate(a.earnedAt) : null; };

    return (
        <HikingShell title="배낭" backTo={HIKING_STAMPS_PATH}>
            <div data-testid="hk-pack" data-mine={s.mine ? "1" : "0"}>
                {s.isLoading ? (
                    <div className="space-y-3 px-5 pt-6" aria-busy="true"><HkSkel className="h-20" /><HkSkel className="h-80" /></div>
                ) : (
                    <>
                        <div className="px-5 pt-5">
                            {s.mine ? (
                                <>
                                    <GradeCard state={s.grade} heightSum={s.heightSum} />
                                    <div className="mt-2.5 flex rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF0A] py-3.5" data-testid="hk-pack-summary">
                                        {([[got, "오른 산"], [kfsGot, `산 와펜 · ${kfs.length || 100}`], [patchN, `도장첩 · ${s.states.length + HIKING_GRANDS.length}`], [s.awards.filter((a) => a.kind === "pin").length, `핀 · ${HIKING_PINS.length}`]] as const).map(([n, label]) => (
                                            <div key={label} className="flex-1 text-center">
                                                <div className="text-[22px] font-semibold tabular-nums leading-none text-[#F4EFE3]">{n}</div>
                                                <div className="mt-1.5 text-[12px] text-[#F4EFE38C]">{label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* 모아 둔 것의 하나 — 산마다 올린 내 사진(내 사진첩) */}
                                    <AlbumEntry from="pack" className="mt-2.5" />
                                </>
                            ) : (
                                <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-3.5 text-[14px] leading-relaxed text-[#F4EFE3CC] break-keep">{HIKING_PACK_INTRO}</p>
                            )}
                        </div>

                        {/* 올해의 산행 — 등산을 쓰는 회원의 것만. 올해 기록이 없으면 그리지 않는다 */}
                        {s.mine && <YearReport summits={s.summits} nameOf={(id) => s.famous.find((m) => m.id === id)?.name} heightOf={(id) => s.famous.find((m) => m.id === id)?.heightM} />}

                        <HkSection title={HIKING_PACK_LABEL.grade} aside={`여덟 등급 · 맨 위는 산 ${HIKING_GRADES[HIKING_GRADES.length - 1].min}곳`}>
                            <GradeLadder state={s.grade} earnedOn={gradeOn} preview={!s.mine} />
                            <p className="mt-2.5 text-[12.5px] leading-snug text-[#F4EFE373] break-keep">{HIKING_GRADE_NOTE}</p>
                        </HkSection>

                        {/* 산 와펜 — 100대 명산 한 곳마다 한 장. 권역별로 */}
                        <HkSection title={HIKING_PACK_LABEL.mountainPatch} aside={s.mine ? `${kfsGot} / ${kfs.length}장` : `100대 명산 ${kfs.length}장`}>
                            <div className="space-y-5" data-testid="hk-mountain-patches">
                                {HIKING_REGIONS.map((r) => {
                                    const list = kfs.filter((m) => m.region === r.id).sort((a, b) => (b.heightM ?? 0) - (a.heightM ?? 0));
                                    if (list.length === 0) return null;
                                    const n = list.filter((m) => s.done.has(m.id)).length;
                                    return (
                                        <div key={r.id} data-testid={`hk-mt-region-${r.id}`}>
                                            <div className="mb-2 flex items-baseline justify-between">
                                                <h3 className="text-[14.5px] font-semibold text-[#F4EFE3]">{r.name}</h3>
                                                <span className="text-[12.5px] tabular-nums text-[#F4EFE38C]">{s.mine ? `${n} / ${list.length}` : `${list.length}곳`}</span>
                                            </div>
                                            <ul className="grid grid-cols-5 gap-x-1 gap-y-3">
                                                {list.map((m) => (
                                                    <li key={m.id} className="min-w-0">
                                                        <Link href={hikingMountainPath(m.slug)} className="flex flex-col items-center text-center active:opacity-70" data-testid={`hk-mt-${m.id}`}>
                                                            <MountainPatch id={m.id} region={m.region} size={52} earned={s.done.has(m.id)} preview={!s.mine} />
                                                            <span className="mt-1 w-full truncate text-[12px] leading-tight" style={{ color: s.done.has(m.id) || !s.mine ? "#F4EFE3" : "#F4EFE399" }}>{mountainLabel(m, dup)}</span>
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="mt-3 text-[12.5px] leading-snug text-[#F4EFE373] break-keep">{MOUNTAIN_PATCH_NOTE}</p>
                        </HkSection>

                        {/* 배낭 덮개 — 캔버스 천 위에 도장첩 와펜 */}
                        <HkSection title={HIKING_PACK_LABEL.bookPatch} aside="도장첩을 다 채우면 한 장">
                            <div className="rounded-[26px] p-[10px]" style={{ background: "linear-gradient(160deg,#7A7448,#5C5733 55%,#6B6540)", boxShadow: "inset 0 1px 0 #FFFFFF33, 0 8px 18px #00000080" }} data-testid="hk-pack-flap">
                                <div className="rounded-[18px] px-2 pb-3 pt-4" style={{ background: "repeating-linear-gradient(45deg,#6E6941 0 3px,#686339 3px 6px)", boxShadow: "inset 0 0 0 1.5px #D9CF9A66, inset 0 0 0 5px #0000001F" }}>
                                    <ul className="grid grid-cols-4 gap-x-1 gap-y-4">
                                        {[...s.states.map((x) => ({ id: x.book.id, art: x.book.art, name: x.book.kind === "plus" ? `${x.book.name} 플러스` : x.book.name, done: x.done, prog: `${x.got}/${x.total}`, href: hikingBookPath(x.book.id), award: s.award("patch", x.book.id) })),
                                            ...HIKING_GRANDS.map((g) => ({ id: g.id, art: g.art, name: g.name, done: !!s.award("grand", g.id), prog: g.how, href: HIKING_STAMPS_PATH, award: s.award("grand", g.id) }))].map((c) => (
                                            <li key={c.id} className="min-w-0">
                                                <Link href={c.href} className="flex flex-col items-center text-center active:opacity-70" data-testid={`hk-pack-${c.id}`} data-done={c.done ? "1" : "0"}>
                                                    {c.done || !s.mine
                                                        ? <PatchArt art={c.art} size={62} earned={c.done} preview={!s.mine} />
                                                        : <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full" style={{ boxShadow: "inset 0 0 0 1.5px #EFE6B866", background: "#00000014", borderRadius: "50%" }}><PatchArt art={c.art} size={46} earned={false} /></span>}
                                                    <span className="mt-1.5 text-[12px] leading-tight break-keep" style={{ color: c.done ? "#FFF8DC" : "#F4EFE3B3" }}>{c.name}</span>
                                                    <span className="text-[12px] tabular-nums leading-tight" style={{ color: c.done ? "#F6D9A8" : "#F4EFE380" }}>{c.award ? stampDate(c.award.earnedAt) : s.mine && c.prog.includes("/") ? c.prog : ""}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </HkSection>

                        <HkSection title={HIKING_PACK_LABEL.pin} aside="산행을 쌓으면 붙어요">
                            <ul className="grid grid-cols-4 gap-x-1 gap-y-5 rounded-2xl bg-[#FFFFFF0A] px-2 py-5" data-testid="hk-pins">
                                {HIKING_PINS.map((p) => {
                                    const a = s.award("pin", p.id);
                                    return (
                                        <li key={p.id} className="flex flex-col items-center text-center" data-testid={`hk-pin-${p.id}`} data-earned={a ? "1" : "0"}>
                                            <PinArt art={p.art} size={58} earned={!!a || !s.mine} />
                                            <span className="mt-1.5 text-[13px] font-semibold leading-tight break-keep" style={{ color: a || !s.mine ? "#F4EFE3" : "#F4EFE399" }}>{p.name}</span>
                                            <span className="mt-0.5 px-0.5 text-[12px] leading-snug break-keep" style={{ color: a ? "#F6D9A8" : "#F4EFE373" }}>{a ? `${a.serial}번째 · ${stampDate(a.earnedAt)}` : p.how}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className="mt-2.5 text-[12.5px] leading-snug text-[#F4EFE373] break-keep">{HIKING_PIN_NOTE}</p>
                        </HkSection>

                        {!s.mine && <div className="px-5 pt-8"><HikingCta /></div>}
                    </>
                )}
            </div>
        </HikingShell>
    );
}
