/**
 * 로드뷰(2026-10-25 오너: "들머리가 어딘지 답답해한다" → "로드뷰도 해 줘") — 들머리 · 낚시터 앞의 거리 사진을 화면 가득.
 * 가까운 로드뷰 자리(반경 PANO_RADIUS_M)를 찾아 연다. 없으면 로드뷰를 만들지 않고 그렇다고 말한다.
 *
 * 💰 유료(로드뷰 한 번 만들 때 — 지도와 같은 값으로 어림). 그래서:
 *   · 이 창이 뜰 때 한 번만 만든다(started 깃발) · 만들기 전에 askKakao("roadview") — 기기 · 서버 하루 상한.
 *   · 창을 닫으면 지운다(다시 열면 다시 묻고 다시 만든다 — 사람이 눌러야만 열린다).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useEffect, useRef, useState } from "react";
import { LucideX } from "@/lib/icons";
import { askKakao, kakaoFailText, loadKakaoMaps } from "./kakaoSdk";

/** 이만큼 안에 로드뷰 자리가 없으면 '없다'고 한다 — 들머리는 길 끝이라 조금 넉넉히 */
export const PANO_RADIUS_M = 300;

type State = { s: "loading" } | { s: "ready" } | { s: "none" } | { s: "fail"; text: string };

export default function KakaoRoadviewSheet({ lat, lng, name, onClose }: { lat: number; lng: number; name: string; onClose: () => void }) {
    const box = useRef<HTMLDivElement>(null);
    const started = useRef(false);
    const mounted = useRef(true);
    const [st, setSt] = useState<State>({ s: "loading" });

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    // 뒤 화면이 같이 스크롤되지 않게
    useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    // 만들기 — 이 창이 사는 동안 한 번(💰)
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void (async () => {
            const ok = await askKakao("roadview");
            if (ok !== "ok") { if (mounted.current) setSt({ s: "fail", text: kakaoFailText(ok, "로드뷰를") }); return; }
            let kakao: any;
            try { kakao = await loadKakaoMaps(); } catch { if (mounted.current) setSt({ s: "fail", text: kakaoFailText("sdk", "로드뷰를") }); return; }
            if (!mounted.current || !box.current) return;
            const pos = new kakao.maps.LatLng(lat, lng);
            new kakao.maps.RoadviewClient().getNearestPanoId(pos, PANO_RADIUS_M, (panoId: number | null) => {
                if (!mounted.current || !box.current) return;
                if (!panoId) { setSt({ s: "none" }); return; }
                try {
                    const rv = new kakao.maps.Roadview(box.current);
                    rv.setPanoId(panoId, pos);
                    setSt({ s: "ready" });
                } catch { setSt({ s: "fail", text: kakaoFailText("sdk", "로드뷰를") }); }
            });
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const big = `https://map.kakao.com/link/roadview/${lat},${lng}`;
    return (
        <div className="fixed inset-0 z-[95] flex flex-col bg-[#0B1F26] text-[#F4EFE3]" role="dialog" aria-modal="true" aria-label={`${name} 로드뷰`} data-testid="kakao-roadview" data-state={st.s}
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
            <div className="flex h-14 shrink-0 items-center gap-2 px-3">
                <p className="min-w-0 flex-1 truncate px-1 text-[16px] font-semibold">{name} <span className="text-[14px] font-medium text-[#F4EFE399]">로드뷰</span></p>
                <button type="button" onClick={onClose} aria-label="닫기" data-testid="kakao-roadview-close" className="flex h-11 w-11 items-center justify-center rounded-full active:bg-[#FFFFFF14]"><LucideX weight="bold" className="h-6 w-6" aria-hidden /></button>
            </div>
            <div className="relative min-h-0 flex-1 bg-[#14313B]">
                <div ref={box} className="absolute inset-0" />
                {st.s !== "ready" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
                        <p className="text-[15px] leading-snug break-keep" data-testid="kakao-roadview-note">
                            {st.s === "loading" ? "로드뷰를 불러오는 중…" : st.s === "none" ? `이 자리 ${PANO_RADIUS_M}m 안에는 로드뷰가 없어요 — 산길 끝이라 차가 못 들어가는 곳이 많아요.` : st.text}
                        </p>
                        {st.s !== "loading" && <a href={big} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center rounded-full bg-[#FFFFFF1F] px-4 text-[14px] font-semibold active:bg-[#FFFFFF2E]">카카오맵에서 찾아보기</a>}
                    </div>
                )}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] text-[#F4EFE399]">
                <span className="break-keep">찍은 날의 모습이에요 · 자료: 카카오</span>
                {st.s === "ready" && <a href={big} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-[#F6D9A8]">카카오맵에서 크게</a>}
            </div>
        </div>
    );
}
