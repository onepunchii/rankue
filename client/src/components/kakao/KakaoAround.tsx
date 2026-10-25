/**
 * 근처 장소 · 로드뷰(2026-10-25 오너: "카카오 API 쓸 만한 것 다 해 줘") — 들머리(등산) · 낚시터(낚시) 옆의 주차장 · 편의점 · 식당 · 카페(낚시는 낚시점)와
 * 그 자리의 로드뷰. 산 화면의 '위치 · 들머리'(MountainLocation)와 낚시터 화면의 '위치'(SpotPage)가 쓴다.
 *
 * 💰 근처 장소는 한 번 찾을 때 2원(카카오 공식 쿼터 문서 — 지도의 20배)이라 가장 아껴 쓴다:
 *   · **스스로 부르지 않는다** — 칩을 눌렀을 때 그 종류 하나만 찾는다(넷을 한꺼번에 찾으면 8원).
 *   · 찾기 전에 askKakao("local") — 기기 · 서버 하루 상한. 한 번 찾은 종류는 이 화면이 떠 있는 동안 메모리에만 둔다
 *     (카카오 결과는 저장하지 않는다 — 기기 저장소 · 조회 캐시에 넣지 않는다).
 *   · 로드뷰는 단추를 눌렀을 때만, 창(KakaoRoadviewSheet — 따로 받는다)이 열릴 때 한 번.
 * 순서 · 이름 · 분류는 카카오가 준 그대로, 거리는 이 자리에서 잰 직선 거리(카카오가 준 값). 가게를 누르면 카카오의 장소 화면.
 * ⚠️ 리터럴 색만(부르는 쪽이 tone 으로 넘긴다). 글자는 12px 이상.
 */
import { Suspense, lazy, useRef, useState } from "react";
import { LucideArrowUpRight, LucideCamera } from "@/lib/icons";
import { kakaoMapUrl } from "@/golf/components/join/joinUi";
import { askKakao, kakaoFailText, kakaoMapReady, loadKakaoMaps } from "./kakaoSdk";

const KakaoRoadviewSheet = lazy(() => import("./KakaoRoadviewSheet"));

/** 찾을 것 — 카테고리 코드(카카오 로컬) 또는 낱말 */
export type AroundKind = { id: string; label: string; code?: string; keyword?: string };
export const AROUND_HIKING: readonly AroundKind[] = [
    { id: "park", label: "주차장", code: "PK6" }, { id: "store", label: "편의점", code: "CS2" }, { id: "food", label: "식당", code: "FD6" }, { id: "cafe", label: "카페", code: "CE7" },
];
export const AROUND_FISHING: readonly AroundKind[] = [
    { id: "bait", label: "낚시점", keyword: "낚시" }, { id: "store", label: "편의점", code: "CS2" }, { id: "park", label: "주차장", code: "PK6" }, { id: "food", label: "식당", code: "FD6" },
];
/** 이만큼 안에서 가까운 순으로 다섯 곳 */
export const AROUND_RADIUS_M = 2000;
const AROUND_SIZE = 5;

type Place = { id: string; name: string; cat: string; m: number | null; url: string; addr: string };
type View = { state: "loading" } | { state: "done"; items: Place[] } | { state: "fail"; text: string };

/** 목적격 조사 — 받침이 있으면 '을', 없으면 '를'(카페를 · 주차장을) */
const eul = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0 ? "을" : "를"; };
const meters = (m: number | null) => (m == null ? "" : m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)}m` : `${(m / 1000).toFixed(1)}km`);

export function KakaoAround({ lat, lng, name, kinds, place = "근처", tone, track, frame = "mt-3 border-t border-[#FFFFFF14] pt-3" }: {
    lat: number; lng: number;
    /** 로드뷰 창 · 카카오맵 링크에 쓰는 이름(들머리 이름 · 낚시터 이름) */
    name: string;
    kinds: readonly AroundKind[];
    /** 머리말 — "들머리 근처" · "낚시터 근처" */
    place?: string;
    tone: { accent: string; onAccent: string; text: string; soft: string; dim: string; panel: string };
    /** 누른 것의 기록 이름 앞부분 — 가게 이름은 남기지 않는다 */
    track: string;
    /** 겉의 여백 · 구분선 — 따로 선 판 안에 넣을 때는 구분선 없이 */
    frame?: string;
}) {
    const [pick, setPick] = useState<string | null>(null);
    const [views, setViews] = useState<Record<string, View>>({});
    const [rv, setRv] = useState(false);
    const busy = useRef(new Set<string>());
    if (!kakaoMapReady) return null;

    const find = async (k: AroundKind) => {
        setPick(k.id);
        if (views[k.id]?.state === "done" || busy.current.has(k.id)) return;   // 이 화면에서 한 번 찾은 것은 다시 찾지 않는다(💰)
        busy.current.add(k.id);
        setViews((v) => ({ ...v, [k.id]: { state: "loading" } }));
        const done = (view: View) => { busy.current.delete(k.id); setViews((v) => ({ ...v, [k.id]: view })); };
        const ok = await askKakao("local");
        if (ok !== "ok") return done({ state: "fail", text: kakaoFailText(ok, "근처 장소를") });
        let kakao: any;
        try { kakao = await loadKakaoMaps(); } catch { return done({ state: "fail", text: kakaoFailText("sdk", "근처 장소를") }); }
        const svc = kakao.maps.services;
        const places = new svc.Places();
        const opts = { location: new kakao.maps.LatLng(lat, lng), radius: AROUND_RADIUS_M, sort: svc.SortBy.DISTANCE, size: AROUND_SIZE };
        const cb = (data: any[], status: string) => {
            if (status === svc.Status.ZERO_RESULT) return done({ state: "done", items: [] });
            if (status !== svc.Status.OK || !Array.isArray(data)) return done({ state: "fail", text: kakaoFailText("net", "근처 장소를") });
            done({
                state: "done",
                items: data.slice(0, AROUND_SIZE).map((d) => ({
                    id: String(d.id), name: String(d.place_name ?? ""), cat: String(d.category_name ?? "").split(" > ").pop() ?? "",
                    m: d.distance != null && d.distance !== "" ? Number(d.distance) : null, url: String(d.place_url ?? ""), addr: String(d.road_address_name || d.address_name || ""),
                })),
            });
        };
        try {
            if (k.code) places.categorySearch(k.code, cb, opts); else places.keywordSearch(k.keyword ?? k.label, cb, opts);
        } catch { done({ state: "fail", text: kakaoFailText("sdk", "근처 장소를") }); }
    };

    const cur = pick ? views[pick] : null;
    const curKind = kinds.find((k) => k.id === pick);
    return (
        <div className={frame} data-testid="kakao-around">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-semibold" style={{ color: tone.text }}>{place}</p>
                <button type="button" onClick={() => setRv(true)} data-track-as={`${track}-roadview`} data-testid="kakao-around-roadview"
                    className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold active:opacity-80" style={{ background: tone.panel, color: tone.text }}>
                    <LucideCamera className="h-4 w-4" aria-hidden />로드뷰
                </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label={`${place} 장소`}>
                {kinds.map((k) => (
                    <button key={k.id} type="button" role="tab" aria-selected={pick === k.id} onClick={() => void find(k)} data-track-as={`${track}-${k.id}`} data-testid={`kakao-around-${k.id}`}
                        className="h-9 rounded-full px-3.5 text-[13.5px] font-semibold" style={pick === k.id ? { background: tone.accent, color: tone.onAccent } : { background: tone.panel, color: tone.soft }}>
                        {k.label}
                    </button>
                ))}
            </div>
            {!cur ? (
                <p className="mt-2 text-[12.5px] leading-snug break-keep" style={{ color: tone.dim }}>보고 싶은 것을 누르면 가까운 곳 다섯 곳을 찾아 드려요.</p>
            ) : cur.state === "loading" ? (
                <div className="mt-2 h-[132px] animate-pulse rounded-xl" style={{ background: tone.panel }} aria-busy="true" />
            ) : cur.state === "fail" ? (
                <p className="mt-2 text-[13px] leading-snug break-keep" style={{ color: tone.soft }} data-testid="kakao-around-fail">{cur.text}</p>
            ) : cur.items.length === 0 ? (
                <p className="mt-2 text-[13px] leading-snug break-keep" style={{ color: tone.soft }} data-testid="kakao-around-none">{AROUND_RADIUS_M / 1000}km 안에서 {curKind?.label ?? ""}{eul(curKind?.label ?? "곳")} 찾지 못했어요.</p>
            ) : (
                <ul className="mt-2 overflow-hidden rounded-xl" style={{ background: tone.panel }} data-testid="kakao-around-list">
                    {cur.items.map((p, i) => (
                        <li key={p.id} className={i ? "border-t border-[#FFFFFF10]" : ""}>
                            <a href={p.url} target="_blank" rel="noopener noreferrer" data-track-as={`${track}-place`} className="flex min-h-[52px] items-center gap-3 px-3.5 py-2 active:opacity-80">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-semibold" style={{ color: tone.text }}>{p.name}</span>
                                    <span className="block truncate text-[12px]" style={{ color: tone.dim }}>{[p.cat, p.addr].filter(Boolean).join(" · ")}</span>
                                </span>
                                <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: tone.soft }}>{meters(p.m)}</span>
                                <LucideArrowUpRight className="h-4 w-4 shrink-0" style={{ color: tone.dim }} aria-hidden />
                            </a>
                        </li>
                    ))}
                </ul>
            )}
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px]" style={{ color: tone.dim }}>
                <span className="break-keep">자료: 카카오 · 직선 거리</span>
                <a href={kakaoMapUrl(name, lat, lng)} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold" style={{ color: tone.soft }}>카카오맵에서 보기</a>
            </div>
            {rv && (
                <Suspense fallback={null}>
                    <KakaoRoadviewSheet lat={lat} lng={lng} name={name} onClose={() => setRv(false)} />
                </Suspense>
            )}
        </div>
    );
}
