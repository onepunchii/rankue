/**
 * 위치·연락(2026-09-24) — 주소 + 카카오맵·길찾기(좌표가 없으면 이름 검색) + 대표 전화·홈페이지. 주소는 눌러서 복사.
 * 주소는 **받은 그대로** 쓴다 — 앞에 지역 묶음(경상·충청…)을 붙이면 "경상 경남 김해시 …" 같은 없는 주소가 된다(2026-09-24 검토).
 *
 * 둘째 판(2026-10-08 오너: "이 골프장이 어디인지 직관적으로 확인이 가능하게 지도를 키워서 좌측으로, 버튼을 우측 배열"):
 *   왼쪽에 '여기' 지도(HereMap)를 크게 세우고, 오른쪽에 주소 · 단추를 세로로 쌓는다. 지도가 주소 옆의 핀 그림을 대신한다.
 *   지도를 못 그리는 골프장(좌표가 없거나 틀 밖)은 예전 모양 — 주소 한 줄 + 단추 두 칸.
 */
import { LucideCopy, LucideExternalLink, LucideMap, LucideMapPin, LucideNavigation, LucidePhone } from "@/lib/icons";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { kakaoMapUrl, kakaoRouteUrl } from "../../join/joinUi";
import { Card, Section } from "./ui";
import { herePoint, type HereTone } from "@shared/golfHereMap";
import { HereMap } from "./HereMap";

const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };

export function LocationCard({ name, address, lat, lng, distance, phone, website, region = null, tone = null, here = null }: {
    name: string; address: string | null; lat: number | null; lng: number | null; distance: string | null;
    phone?: string | null; website?: string | null;
    /** 지역 묶음("경기") — 지도에서 그 지역을 밝힌다 */
    region?: string | null;
    /** 지도 '여기'의 가운데 점 색 — 지금 올라온 글·내 관심(허브 지도와 같은 뜻) */
    tone?: HereTone;
    /** 지도에 찍을 자리 — 좌표가 없거나 틀린 골프장은 서버가 시군 중심으로 바꿔 준다(카카오맵 링크의 lat·lng 와 따로) */
    here?: { lat: number; lng: number } | null;
}) {
    const { toast } = useToast();
    const full = address?.trim() || null;
    const site = website ? (/^https?:\/\//.test(website) ? website : `http://${website}`) : null;
    const copy = async () => {
        if (!full) return;
        try { await navigator.clipboard.writeText(full); toast({ title: "주소를 복사했어요" }); }
        catch { toast({ title: full }); }
    };
    const hasMap = !!herePoint(here?.lat, here?.lng);
    const btn = "h-11 min-w-0 px-2 rounded-xl text-[14px] font-medium inline-flex items-center justify-center gap-1.5";
    const plain = "bg-[#FFFFFF0F] text-white active:bg-[#FFFFFF1A]";

    const addr = full && (
        <button type="button" onClick={copy} className="flex items-start gap-2.5 text-left -m-1 p-1 rounded-lg active:bg-[#FFFFFF0A]">
            {/* 지도가 있으면 지도의 '여기'가 핀이다 — 좁은 칸에 핀 그림을 또 두지 않는다 */}
            {!hasMap && <LucideMapPin className="w-5 h-5 mt-0.5 shrink-0 text-[#64DD17]" />}
            <span className="flex-1 min-w-0">
                <span className="block text-[15px] text-white break-keep">{full}</span>
                {distance && <span className="block mt-0.5 text-[13px] text-[#FFFFFF80]">내 위치에서 {distance}</span>}
            </span>
            <LucideCopy className="w-4 h-4 mt-1 shrink-0 text-[#FFFFFF4D]" />
        </button>
    );
    const buttons = (
        <>
            <a href={kakaoMapUrl(name, lat, lng)} target="_blank" rel="noopener noreferrer" className={cn(btn, plain)}>
                <LucideMap className="w-[18px] h-[18px] shrink-0" />카카오맵
            </a>
            <a href={kakaoRouteUrl(name, lat, lng)} target="_blank" rel="noopener noreferrer" className={cn(btn, "bg-[#FEE500] text-[#191600] active:bg-[#E6CF00]")}>
                <LucideNavigation className="w-[18px] h-[18px] shrink-0" />길찾기
            </a>
            {phone && (
                <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className={cn(btn, plain)}>
                    <LucidePhone className="w-[18px] h-[18px] shrink-0" /><span className="tabular-nums whitespace-nowrap">{phone}</span>
                </a>
            )}
            {site && (
                <a href={site} target="_blank" rel="noopener noreferrer nofollow" className={cn(btn, plain)}>
                    <LucideExternalLink className="w-[18px] h-[18px] shrink-0" /><span className="truncate">{hostOf(site)}</span>
                </a>
            )}
        </>
    );

    return (
        <Section id="map" title="위치·연락">
            {hasMap ? (
                <Card className="p-3.5 flex items-stretch gap-3.5">
                    <HereMap lat={here?.lat ?? null} lng={here?.lng ?? null} region={region} tone={tone} />
                    <div className="flex-1 min-w-0 flex flex-col justify-between gap-3.5">
                        {addr}
                        <div className="flex flex-col gap-2">{buttons}</div>
                    </div>
                </Card>
            ) : (
                <Card className="p-4">
                    {addr && <div className="flex flex-col">{addr}</div>}
                    <div className={cn("grid grid-cols-2 gap-2", full && "mt-4")}>{buttons}</div>
                </Card>
            )}
        </Section>
    );
}
