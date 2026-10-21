/**
 * 도장첩의 '코리아둘레길' 칸(2026-10-21) — 길 넷마다 내 코스 도장(최근 것부터 여섯 개) · 받은 수 / 공개 코스 수 · 길 페이지로.
 * 회원이 아니면(또는 아직 도장이 없으면) 흐린 도장과 받는 법 한 줄. 예시(?example=1)는 다 모은 모습 — 공개 코스가 다 찍힌 꼴.
 * 길 넷의 '완주'는 두루누비가 전 코스를 공개하기 전엔 그리지 않는다(공개 170 / 284).
 * ⚠️ 리터럴 색만(등산의 색). 글자는 12px 이상.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronRight } from "@/lib/icons";
import { TRAILS_PATH, TRAIL_ROUTES, trailRoutePath, type TrailRouteId } from "@shared/koreaTrails";
import { HkSection } from "../components/HikingShell";
import { TRAILS_KEY, type TrailsData } from "./api";
import { TrailStampSeal, useMyTrails } from "./TrailStamp";

/** 폭 360 에서 한 줄에 드는 수(36px · 사이 6px) — 넘치면 '+n' */
const SHOW = 6;

export function TrailShelfSection({ example = false }: { example?: boolean }) {
    const { data } = useQuery<TrailsData>({ queryKey: TRAILS_KEY, staleTime: 60 * 60_000 });
    const my = useMyTrails();
    if (!data) return null;
    const total = example ? data.courses.length : my?.stamps.length ?? 0;
    return (
        <HkSection title="코리아둘레길" aside={`코스 도장 ${total}개`}>
            <ul className="space-y-2.5" data-testid="hk-trail-shelf">
                {TRAIL_ROUTES.map((r) => {
                    const courses = data.courses.filter((c) => c.route === r.id);
                    const mine = example
                        ? courses.map((c) => c.key)
                        : (my?.stamps ?? []).filter((s) => s.route === r.id).sort((a, b) => Date.parse(b.doneAt) - Date.parse(a.doneAt)).map((s) => s.key);
                    const n = mine.length;
                    return (
                        <li key={r.id}>
                            <Link href={trailRoutePath(r.id)} className="block rounded-2xl px-4 py-3.5 active:opacity-80" style={{ background: "#FFFFFF0A", boxShadow: `inset 3px 0 0 ${r.color}` }} data-testid="hk-trail-shelf-route" data-route={r.id}>
                                <span className="flex items-center justify-between gap-2">
                                    <span className="text-[16px] font-semibold" style={{ color: r.color }}>{r.name}</span>
                                    <span className="flex items-center gap-1.5 text-[13px] tabular-nums text-[#F4EFE3B3]">{n} / {courses.length}코스<LucideChevronRight weight="bold" className="h-4 w-4 text-[#F4EFE366]" aria-hidden /></span>
                                </span>
                                <span className="mt-2.5 flex items-center gap-1.5" aria-hidden>
                                    {n > 0
                                        ? <>
                                            {mine.slice(0, SHOW).map((k) => (
                                                <span key={k} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F4EFE3]"><TrailStampSeal route={r.id as TrailRouteId} label={k} state="done" size={34} /></span>
                                            ))}
                                            {n > SHOW && <span className="ml-0.5 text-[13px] tabular-nums text-[#F4EFE3B3]">+{n - SHOW}</span>}
                                        </>
                                        : [1, 2, 3].map((i) => (
                                            // 빈 칸 — 점선 동그라미에 코스 번호만(흐린 도장보다 깔끔하다)
                                            <span key={i} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold tabular-nums" style={{ border: `1.5px dashed ${r.color}80`, color: `${r.color}B3` }} data-testid="hk-trail-shelf-empty">{i}</span>
                                        ))}
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            <p className="mt-2.5 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">
                코스의 두 끝에서 위치를 한 번씩 확인하면 그 코스의 도장이에요 · <Link href={TRAILS_PATH} className="text-[#F6D9A8] underline underline-offset-2">둘레길 보기</Link>
            </p>
        </HkSection>
    );
}
