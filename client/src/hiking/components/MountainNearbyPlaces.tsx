/**
 * 산 근처의 맛집 · 카페(2026-10-13) — 네이버 지역 검색 결과를 그 자리에서 불러 보여 준다. 골프장 상세의 '근처'(NearbyPlaces)를 등산에 옮긴 것.
 *
 * 네이버 검색 API 약관 때문에 지키는 것(shared/hikingAround 머리말 — 골프와 같은 규칙):
 *   · 구역이 화면에 들어올 때 · 칩을 누를 때 **실시간으로** 부른다. 받은 답은 이 구역이 떠 있는 동안의 메모리에만 1분 둔다 —
 *     기기에 남는 조회 캐시(일주일 남는다)에는 넣지 않는다. 그래서 조회 훅을 쓰지 않고 그때그때 받는다(lib/api fetchMountainNearby).
 *   · 순서 · 낱말은 네이버가 준 그대로. 거리 · 별점 같은 우리 표시를 얹지 않는다. 한 번에 다섯 곳이 끝이라 '더 보기'는 네이버 지도로 넘긴다.
 *   · 검색어는 서버가 만든다 — 여기서 보내는 것은 산의 주소와 칩의 종류뿐이다.
 *   · 검색엔진용 화면에는 없다. 누른 것의 기록에는 구역 이름만 남긴다(data-track-as — 가게 이름 · 주소는 남기지 않는다).
 * 못 불러와도 구역은 남는다 — 네이버 지도에서 같은 말로 찾아보는 줄 하나.
 * ⚠️ 산 이름으로 찾은 결과가 얼마나 가까운지는 아직 재지 않았다(shared/hikingAround 머리말). 칩이 둘뿐인 까닭이다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지. 글자 그림(이모지)을 쓰지 않는다 — 기기마다 모양이 다르다.
 */
import { useEffect, useRef, useState } from "react";
import { LucideArrowUpRight } from "@/lib/icons";
import {
    HIKING_NEARBY_HOLD_MS, HIKING_NEARBY_KINDS, MOUNTAIN_AROUND_LABEL, cleanMountainName, hikingNaverMapUrl, hikingNearbyQuery, hikingNearbyWord, hikingPlaceUrl,
    type HikingNearbyKind, type HikingNearbyResult,
} from "@shared/hikingAround";
import { HkSection } from "./HikingShell";
import { fetchMountainNearby } from "../lib/api";

type View = { kind: HikingNearbyKind; state: "loading" | "done" | "error"; res: HikingNearbyResult | null };
const ROW = "flex items-center gap-3 px-4 active:bg-[#FFFFFF0F]";

export function MountainNearbyPlaces({ slug, name }: { slug: string; name: string }) {
    const [kind, setKind] = useState<HikingNearbyKind>("food");
    const word = hikingNearbyWord(kind);

    // 화면에 들어올 때 처음 부른다 — 구역까지 내려오지 않는 사람 몫의 호출을 아낀다(하루 한도가 있다)
    const mark = useRef<HTMLDivElement>(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = mark.current;
        if (!el || seen) return;
        if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
        const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "240px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [seen]);

    // 받은 답 — 이 구역의 메모리에만, 1분(칩을 오갈 때 다시 부르지 않을 만큼). 구역이 사라지면 같이 사라진다
    const held = useRef(new Map<HikingNearbyKind, { at: number; res: HikingNearbyResult }>());
    const [view, setView] = useState<View>({ kind: "food", state: "loading", res: null });
    useEffect(() => {
        if (!seen) return;
        const hit = held.current.get(kind);
        if (hit && Date.now() - hit.at < HIKING_NEARBY_HOLD_MS) { setView({ kind, state: "done", res: hit.res }); return; }
        let alive = true;
        setView({ kind, state: "loading", res: null });
        fetchMountainNearby(slug, kind)
            .then((res) => { held.current.set(kind, { at: Date.now(), res }); if (alive) setView({ kind, state: "done", res }); })
            .catch(() => { if (alive) setView({ kind, state: "error", res: null }); });
        return () => { alive = false; };
    }, [seen, slug, kind]);

    const mine = view.kind === kind ? view : null;
    const loading = !seen || !mine || mine.state === "loading";
    const items = mine?.res?.items ?? [];
    // '더 보기'는 서버가 실제로 답을 받은 검색어로 연다(이름을 바꿔 물었으면 그 말). 아직 없으면 다듬은 이름으로
    const query = mine?.res?.query || hikingNearbyQuery(cleanMountainName(name) || name, kind);

    return (
        <HkSection title={`근처 ${word}`} aside={MOUNTAIN_AROUND_LABEL.naver} sec="food">
            <div ref={mark} />
            <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="근처에서 찾을 것">
                {HIKING_NEARBY_KINDS.map((k) => {
                    const on = k.key === kind;
                    return (
                        <button key={`nearby-kind:${k.key}`} type="button" role="tab" aria-selected={on} onClick={() => setKind(k.key)} data-testid={`hk-nearby-kind-${k.key}`}
                            className="h-9 rounded-full px-3.5 text-[14px]" style={{ background: on ? "#F28C6A" : "#FFFFFF14", color: on ? "#2A1208" : "#F4EFE3", fontWeight: on ? 600 : 400 }}>
                            {k.word}
                        </button>
                    );
                })}
            </div>
            {/* data-track-as: 방문자 발자국은 이 구역에서 누른 것을 구역 이름으로만 남긴다 — 네이버 결과의 글자 · 주소는 저장하지 않는다 */}
            <div className="overflow-hidden rounded-2xl bg-[#FFFFFF0A]" data-track-as="hiking-nearby-places" data-testid="hk-nearby" data-state={loading ? "loading" : mine?.state} data-count={items.length}>
                {loading ? (
                    <ul aria-hidden>
                        {[0, 1, 2, 3, 4].map((i) => (
                            <li key={`nearby-skel:${i}`} className={`px-4 py-3 ${i ? "border-t border-[#FFFFFF14]" : ""}`}>
                                <div className="h-[18px] w-2/5 animate-pulse rounded-lg bg-[#FFFFFF0F]" />
                                <div className="mt-2 h-[14px] w-4/5 animate-pulse rounded-lg bg-[#FFFFFF0F]" />
                            </li>
                        ))}
                    </ul>
                ) : items.length > 0 ? (
                    <ul>
                        {items.map((p, i) => (
                            <li key={`nearby-place:${i}:${p.name}`} className={i ? "border-t border-[#FFFFFF14]" : ""}>
                                <a href={hikingPlaceUrl(p)} target="_blank" rel="noopener noreferrer nofollow" className={`${ROW} py-3`}>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[15px] font-semibold text-[#F4EFE3]">{p.name}</span>
                                        <span className="mt-0.5 block truncate text-[13px] text-[#F4EFE38C]">{[p.category, p.address].filter(Boolean).join(" · ")}</span>
                                    </span>
                                    <LucideArrowUpRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE399]" aria-hidden />
                                </a>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="px-4 pb-1 pt-4 text-[14px] text-[#F4EFE399] break-keep">{mine?.state === "error" ? "지금은 목록을 불러올 수 없어요." : "검색 결과가 없어요."}</p>
                )}
                <a href={hikingNaverMapUrl(query)} target="_blank" rel="noopener noreferrer nofollow" className={`${ROW} border-t border-[#FFFFFF14] py-3.5 text-[14px] font-medium text-[#F4EFE3CC]`}>
                    <span className="min-w-0 flex-1 truncate">네이버 지도에서 {word} {items.length > 0 ? "더 보기" : "찾아보기"}</span>
                    <LucideArrowUpRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE380]" aria-hidden />
                </a>
            </div>
        </HkSection>
    );
}

export default MountainNearbyPlaces;
