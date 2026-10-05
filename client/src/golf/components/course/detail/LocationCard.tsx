/**
 * 위치·연락(2026-09-24) — 주소 + 카카오맵·길찾기(좌표가 없으면 이름 검색) + 대표 전화·홈페이지. 주소는 눌러서 복사.
 * 주소는 **받은 그대로** 쓴다 — 앞에 지역 묶음(경상·충청…)을 붙이면 "경상 경남 김해시 …" 같은 없는 주소가 된다(2026-09-24 검토).
 * 주소 왼쪽에 '여기' 미니 지도(2026-10-05, HereMap) — 전국 점 지도에 이 골프장 하나를 켠다. 좌표가 없거나 틀 밖이면 그리지 않는다.
 */
import { LucideCopy, LucideExternalLink, LucideMap, LucideMapPin, LucideNavigation, LucidePhone } from "@/lib/icons";
import { useToast } from "@/hooks/use-toast";
import { kakaoMapUrl, kakaoRouteUrl } from "../../join/joinUi";
import { Card, Section } from "./ui";
import { herePoint, type HereTone } from "@shared/golfHereMap";
import { HereMap } from "./HereMap";

const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };

export function LocationCard({ name, address, lat, lng, distance, phone, website, region = null, tone = null, here = null }: {
    name: string; address: string | null; lat: number | null; lng: number | null; distance: string | null;
    phone?: string | null; website?: string | null;
    /** 지역 묶음("경기") — 미니 지도에서 그 지역 윤곽선을 밝힌다 */
    region?: string | null;
    /** 미니 지도의 켜진 점 색 — 지금 올라온 글·내 관심(허브 지도와 같은 뜻) */
    tone?: HereTone;
    /** 미니 지도에 찍을 자리 — 좌표가 없거나 틀린 골프장은 서버가 시군 중심으로 바꿔 준다(카카오맵 링크의 lat·lng 와 따로) */
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
    // 맨 윗줄(미니 지도 · 주소) — 둘 다 없으면 줄을 그리지 않는다
    const hasTop = !!full || !!herePoint(here?.lat, here?.lng);
    const btn = "flex-1 h-11 rounded-xl text-[14px] font-medium inline-flex items-center justify-center gap-1.5";
    return (
        <Section id="map" title="위치·연락">
            <Card className="p-4">
                {hasTop && (
                <div className="flex items-center gap-3.5">
                    <HereMap lat={here?.lat ?? null} lng={here?.lng ?? null} region={region} tone={tone} />
                    {full && (
                        <button type="button" onClick={copy} className="flex-1 min-w-0 flex items-start gap-2.5 text-left -m-1 p-1 rounded-lg active:bg-[#FFFFFF0A]">
                            <LucideMapPin className="w-5 h-5 mt-0.5 shrink-0 text-[#64DD17]" />
                            <span className="flex-1 min-w-0">
                                <span className="block text-[15px] text-white break-keep">{full}</span>
                                {distance && <span className="block mt-0.5 text-[13px] text-[#FFFFFF80]">내 위치에서 {distance}</span>}
                            </span>
                            <LucideCopy className="w-4 h-4 mt-1 shrink-0 text-[#FFFFFF4D]" />
                        </button>
                    )}
                </div>
                )}
                <div className={`flex gap-2 ${hasTop ? "mt-4" : ""}`}>
                    <a href={kakaoMapUrl(name, lat, lng)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#FFFFFF0F] text-white active:bg-[#FFFFFF1A]`}>
                        <LucideMap className="w-[18px] h-[18px]" />카카오맵
                    </a>
                    <a href={kakaoRouteUrl(name, lat, lng)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#FEE500] text-[#191600] active:bg-[#E6CF00]`}>
                        <LucideNavigation className="w-[18px] h-[18px]" />길찾기
                    </a>
                </div>
                {(phone || site) && (
                    <div className="mt-2 flex gap-2">
                        {phone && (
                            <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className={`${btn} bg-[#FFFFFF0F] text-white active:bg-[#FFFFFF1A]`}>
                                <LucidePhone className="w-[18px] h-[18px]" /><span className="tabular-nums">{phone}</span>
                            </a>
                        )}
                        {site && (
                            <a href={site} target="_blank" rel="noopener noreferrer nofollow" className={`${btn} bg-[#FFFFFF0F] text-white active:bg-[#FFFFFF1A] min-w-0`}>
                                <LucideExternalLink className="w-[18px] h-[18px] shrink-0" /><span className="truncate">{hostOf(site)}</span>
                            </a>
                        )}
                    </div>
                )}
            </Card>
        </Section>
    );
}
