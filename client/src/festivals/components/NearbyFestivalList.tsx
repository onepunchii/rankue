/**
 * 이 근처 축제 목록(2026-10-21, 오너 "공개 페이지 + 종목별") — 골프장 · 낚시터 페이지에 그 자리 20km 안, 열렸거나 45일 안에 여는 축제 셋까지.
 * 고르는 셈은 서버(shared/tourFestivals 의 nearbyFestivals — 산 페이지와 같다). 누르면 우리 축제 페이지. 구역 틀(제목)은 부르는 화면의 것을 쓴다.
 * 날짜 칸: 열린 것은 '진행 중'(강조색), 곧 여는 것은 그 날짜. ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { festivalPath, festivalPeriod } from "@shared/festivals";
import type { NearbyFestival } from "@shared/tourFestivals";

export interface FestivalListTone { accent: string; onAccent: string; text: string; dim: string; tile: string; card: string }
export const GOLF_FESTIVAL_TONE: FestivalListTone = { accent: "#64DD17", onAccent: "#0B2A00", text: "#FFFFFF", dim: "#FFFFFF99", tile: "#FFFFFF14", card: "#FFFFFF08" };
export const FISHING_FESTIVAL_TONE: FestivalListTone = { accent: "#F4A963", onAccent: "#2A1606", text: "#F3ECDD", dim: "#F3ECDD99", tile: "#FFFFFF14", card: "#FFFFFF0A" };

export function NearbyFestivalList({ items, tone, testId = "nearby-festivals" }: { items: readonly NearbyFestival[]; tone: FestivalListTone; testId?: string }) {
    if (!items.length) return null;
    return (
        <div data-testid={testId}>
            <ul className="space-y-2">
                {items.map((f) => (
                    <li key={f.id}>
                        <Link href={festivalPath(f.id)} className="flex items-center gap-3 rounded-2xl px-3.5 py-3 active:opacity-80" style={{ background: tone.card }} data-testid="nearby-festival-link">
                            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none" style={f.state === "now" ? { background: tone.accent, color: tone.onAccent } : { background: tone.tile, color: tone.text }}>
                                <span className="text-[12px] font-semibold">{f.state === "now" ? "진행" : `${Number(f.start.slice(4, 6))}월`}</span>
                                <span className="mt-0.5 text-[15px] font-semibold tabular-nums">{f.state === "now" ? "중" : Number(f.start.slice(6, 8))}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-semibold" style={{ color: tone.text }}>{f.title}</span>
                                <span className="mt-0.5 block truncate text-[12.5px] tabular-nums" style={{ color: tone.dim }}>{festivalPeriod(f)} · {f.km < 1 ? "1km 안" : `${f.km.toFixed(f.km < 10 ? 1 : 0)}km`}</span>
                            </span>
                            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: tone.dim }} aria-hidden />
                        </Link>
                    </li>
                ))}
            </ul>
            <p className="mt-2 text-[12px]" style={{ color: tone.dim }}>축제 정보 한국관광공사 · 날짜와 운영은 바뀔 수 있어요</p>
        </div>
    );
}
