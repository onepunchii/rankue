/**
 * 오늘의 명산(2026-10-21) — 100대 명산 가운데 한국관광공사 사진이 있는 산 여덟(서버가 날마다 돌린다 — GET /hiking/featured-photos).
 * 2026-11-04 오너: "홈에 등산 사진도 매력적으로 조금 크게" — 높이 150 → 210, 그림자, 그리고 줄 앞에 **요즘 회원이 올린 공개 사진**
 * (GET /hiking/recent-photos — 30일 · 한 사람 둘 · 여덟 장, 셋 미만이면 섞지 않는다 · 보는 사람이 차단한 회원 제외). 회원 사진에는 '회원 사진' 딱지와
 * 올린 사람의 이름 · 달(산의 사진 화면과 같은 것만). 누르면 그 산 페이지. 등산 홈과 허브(방문자에게도 — 산의 사진처럼 공개된 것)에 놓인다.
 * 사진은 자르지 않는다 — 높이만 맞추고 가로는 사진 그대로(공공누리 제3유형 변경 금지 · 회원 사진도 같은 결로). 받지 못하면 칸이 없다.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { hikingMountainPath } from "@shared/hikingMountains";
import { RECENT_PHOTO_MIN, type RecentHikingPhoto } from "@shared/hikingPhotos";
import { HkSection } from "./HikingShell";
import { CheerCount } from "../photos/CheerParts";

type Item = { slug: string; name: string; heightM: number | null; sigungu: string | null; photo: { url: string; lic: "Type1" | "Type3" } };
/** 사진의 높이(px) — 가로는 사진 그대로 */
const H = 210;
const FRAME = { background: "#FFFFFF0A", boxShadow: "0 8px 18px rgba(0,0,0,0.35), inset 0 0 0 1px #F4EFE31F" } as const;

export function FeaturedPhotos() {
    const { data } = useQuery<{ items: Item[] }>({ queryKey: ["/api/hiq/hiking/featured-photos"], staleTime: 30 * 60_000 });
    const recent = useQuery<{ photos: RecentHikingPhoto[] }>({ queryKey: ["/api/hiq/hiking/recent-photos"], staleTime: 5 * 60_000 });
    const items = Array.isArray(data?.items) ? data!.items : [];
    const got = Array.isArray(recent.data?.photos) ? recent.data!.photos.filter((p) => p.width > 0 && p.height > 0) : [];
    const members = got.length >= RECENT_PHOTO_MIN ? got : [];
    if (items.length < 3 && !members.length) return null;
    return (
        <HkSection title={members.length ? "요즘 산 사진" : "오늘의 명산"} aside={members.length ? "회원 · 한국관광공사" : "사진 한국관광공사"}>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="hiking-featured">
                {members.map((p, i) => (
                    <Link key={`member:${p.id}`} href={hikingMountainPath(p.mountainSlug)} className="shrink-0 active:opacity-80" data-testid="hiking-featured-member" data-track-as="hiking-featured-member">
                        <span className="relative block overflow-hidden rounded-[18px]" style={FRAME}>
                            <img src={p.thumbUrl || p.url} alt={`${p.mountainName} 회원 사진`} width={Math.round((H * p.width) / p.height)} height={H} loading={i < 2 ? "eager" : "lazy"} decoding="async" draggable={false}
                                className="block h-[210px] w-auto max-w-none select-none" />
                            <span className="absolute left-2.5 top-2.5 rounded-full px-2 py-1 text-[12px] font-medium leading-none text-[#F6D9A8]" style={{ background: "#0B1F26CC" }}>회원 사진</span>
                        </span>
                        <span className="mt-2 block text-[15.5px] font-semibold text-[#F4EFE3]">{p.mountainName}</span>
                        <span className="flex items-center gap-1.5 text-[12.5px] text-[#F4EFE399]">{p.credit} · {p.month}<CheerCount n={p.cheers} /></span>
                    </Link>
                ))}
                {items.map((m, i) => (
                    <Link key={m.slug} href={hikingMountainPath(m.slug)} className="shrink-0 active:opacity-80" data-testid="hiking-featured-card">
                        <span className="block overflow-hidden rounded-[18px]" style={FRAME}>
                            <img src={m.photo.url} alt={`${m.name} 사진`} loading={!members.length && i < 2 ? "eager" : "lazy"} decoding="async" draggable={false} referrerPolicy="no-referrer"
                                className="block h-[210px] w-auto max-w-none select-none" />
                        </span>
                        <span className="mt-2 block text-[15.5px] font-semibold text-[#F4EFE3]">{m.name}</span>
                        <span className="block text-[12.5px] text-[#F4EFE399] tabular-nums">{[m.heightM ? `${m.heightM.toLocaleString()}m` : null, m.sigungu].filter(Boolean).join(" · ")}</span>
                    </Link>
                ))}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-[#F4EFE366] break-keep">
                {members.length ? "회원 사진은 올린 사람이 공개로 둔 것이에요 · " : ""}사진 한국관광공사 · 공공누리 제1 · 3유형 — 날마다 다른 산이 와요
            </p>
        </HkSection>
    );
}
