/**
 * 어드민 · 회원 상세의 '종목' 칸(2026-10-17 어드민 전수 조사 — 기반의 "회원 상세에 종목 칸" + 낚시 ⑤ "회원별 낚시 데이터").
 * 당구 큐 케이스 · 초대 · 온라인 레이팅 / 골프 보상 / 등산 기록 수 / 낚시 기록 수 + 최근 조과. 좌표는 오지 않는다(shared/adminMemberSports 머리말).
 * 보여 주기만 한다 — 고치는 일은 각 종목 메뉴에서. 기록이 없는 종목은 한 줄로 접는다.
 */
import { useQuery } from "@tanstack/react-query";
import { caseItem } from "@shared/cueCase";
import { tierFor } from "@shared/sim/rank";
import { GOODS_SPORT_NAME, type GoodsSport } from "@shared/goods";
import { caseByKind, catchSize, golfAwardGroups, hikingAwardGroups, limitedCount, sportHasData, type AdminMemberSports } from "@shared/adminMemberSports";
import { useT } from "@/lib/i18n";
import { Pill, kstDate } from "./adminUtils";

export const memberSportsKey = (id: string) => ["/api/hiq/admin/members", id, "sports"] as const;

const TONE: Record<GoodsSport, string> = { billiards: "#006241", golf: "#C24E00", hiking: "#A34E2E", fishing: "#1D5F8A" };
const GAME_NAME: Record<string, string> = { "3c": "3쿠션", "4c": "4구" };

function Cell({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "alert" | "warn" | "muted" }) {
    const color = tone === "alert" ? "text-red-600" : tone === "warn" ? "text-amber-700" : tone === "muted" ? "text-black/35" : "text-[rgba(0,0,0,0.87)]";
    return (
        <div className="min-w-0 rounded-xl bg-black/[0.03] px-1 py-2 text-center">
            <p className="truncate text-[11px] font-bold text-black/45">{label}</p>
            <p className={`mt-0.5 text-[16px] leading-tight font-black tabular-nums ${color}`}>{value}</p>
        </div>
    );
}

function Card({ sport, children, grant }: { sport: GoodsSport; children: React.ReactNode; grant?: { active: number; revoked: number } }) {
    return (
        <div className="rounded-2xl bg-white border border-black/[0.07] p-3.5" data-testid={`member-sport-${sport}`}>
            <div className="mb-2 flex items-center gap-2">
                <span aria-hidden className="h-3.5 w-1 rounded-full" style={{ background: TONE[sport] }} />
                <p className="flex-1 text-[13.5px] font-black" style={{ color: TONE[sport] }}>{GOODS_SPORT_NAME[sport]}</p>
                {grant && grant.active + grant.revoked > 0 && (
                    <span className="text-[11.5px] font-bold text-black/45">운영자 증정 {grant.active}{grant.revoked ? ` · 회수 ${grant.revoked}` : ""}</span>
                )}
            </div>
            {children}
        </div>
    );
}

const Line = ({ children }: { children: React.ReactNode }) => <p className="mt-2 text-[12.5px] leading-snug break-keep text-black/60">{children}</p>;

export default function MemberSportsSection({ memberId }: { memberId: string }) {
    const { t } = useT();
    // 시트를 열 때만 받는다 — 닫으면 캐시에서 지운다(골프 칸과 같은 선)
    const q = useQuery<AdminMemberSports>({ queryKey: memberSportsKey(memberId), gcTime: 0 });
    const heading = <h3 className="text-[12px] font-black text-black/45 mb-2">종목</h3>;
    if (q.isLoading) return <section>{heading}<div className="rounded-2xl bg-white border border-black/[0.07] px-4 py-6 text-center text-[13px] text-black/40">불러오는 중…</div></section>;
    if (q.isError || !q.data) {
        return (
            <section>
                {heading}
                <div className="rounded-2xl bg-white border border-black/[0.07] px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-[13px] text-black/50">종목 기록을 불러오지 못했습니다.</p>
                    <button onClick={() => void q.refetch()} className="shrink-0 h-9 px-3 rounded-lg border border-black/10 text-[13px] font-bold text-black/65">다시 불러오기</button>
                </div>
            </section>
        );
    }
    const s = q.data;
    const has = sportHasData(s);
    const empty = (Object.keys(has) as GoodsSport[]).filter((k) => !has[k]);
    const b = s.billiards, h = s.hiking, f = s.fishing;
    const kinds = caseByKind(b.caseItems);
    const golf = golfAwardGroups(s.golf.awards);
    const hikA = hikingAwardGroups(h.awards);
    const hero = b.hero ? caseItem(b.hero) : null;
    return (
        <section data-testid="member-sports">
            {heading}
            <div className="space-y-2">
                {has.billiards && (
                    <Card sport="billiards" grant={s.grants.billiards}>
                        <div className="grid grid-cols-4 gap-1.5">
                            <Cell label="큐 케이스" value={b.caseItems.length} />
                            <Cell label="한정 큐" value={limitedCount(b.caseItems)} />
                            <Cell label="초대 가입" value={b.invites.joined} />
                            <Cell label="초대 취소" value={b.invites.canceled} tone={b.invites.canceled ? "warn" : "muted"} />
                        </div>
                        {b.caseItems.length > 0 && (
                            <Line>큐 {kinds.cue} · 상대 {kinds.shaft} · 공 {kinds.ball} · 초크 {kinds.chalk} · 장갑 {kinds.glove} · 페넌트 {kinds.pennant}{kinds.other ? ` · 지금 없는 물건 ${kinds.other}` : ""}{hero ? ` · 대표 큐 ${hero.name.ko}` : ""}</Line>
                        )}
                        {b.invites.invitedBy && <Line>{b.invites.invitedBy}님의 초대로 가입</Line>}
                        {b.online.filter((o) => o.matches > 0).map((o) => (
                            <Line key={o.gameType}>
                                온라인 {GAME_NAME[o.gameType] ?? o.gameType} <b className="tabular-nums text-black/80">{o.rating.toLocaleString()}</b> · {t(tierFor(o.rating).nameKey)} · {o.matches}판 {o.wins}승
                            </Line>
                        ))}
                    </Card>
                )}
                {has.golf && (
                    <Card sport="golf" grant={s.grants.golf}>
                        <div className="grid grid-cols-4 gap-1.5">
                            <Cell label="도장첩 완성" value={golf.books} />
                            <Cell label="트로피" value={golf.trophies} />
                            <Cell label="업적 핀" value={golf.pins} />
                            <Cell label="한정 볼마커" value={golf.markers} />
                        </div>
                    </Card>
                )}
                {has.hiking && (
                    <Card sport="hiking" grant={s.grants.hiking}>
                        <div className="grid grid-cols-4 gap-1.5">
                            <Cell label="정상 인증" value={h.verified} />
                            <Cell label="인증 없음" value={h.unverified} tone={h.unverified ? undefined : "muted"} />
                            <Cell label="취소한 인증" value={h.voided} tone={h.voided ? "alert" : "muted"} />
                            <Cell label="오른 산" value={h.mountains} />
                            <Cell label="산행" value={h.trips} />
                            <Cell label="정상까지" value={h.reached} />
                            <Cell label="걸은 km" value={h.km} />
                            <Cell label="사진" value={h.photos} />
                        </div>
                        <Line>
                            와펜 {hikA.patches} · 완등 {hikA.grands} · 핀 {hikA.pins} · 등급 {hikA.grades} · 표시 지점 {h.marks} · 산악회 {h.crews}
                            {h.hiddenPhotos ? <span className="text-red-600"> · 가린 사진 {h.hiddenPhotos}</span> : null}
                            {h.lastAt ? <span className="text-black/40"> · 마지막 정상 {kstDate(h.lastAt)}</span> : null}
                        </Line>
                    </Card>
                )}
                {has.fishing && (
                    <Card sport="fishing" grant={s.grants.fishing}>
                        <div className="grid grid-cols-4 gap-1.5">
                            <Cell label="조과" value={f.catches} />
                            <Cell label="어종" value={f.species} />
                            <Cell label="마릿수" value={f.fish} />
                            <Cell label="공개" value={f.public} />
                            <Cell label="가려짐" value={f.hidden} tone={f.hidden ? "alert" : "muted"} />
                            <Cell label="이의제기" value={f.appeals} tone={f.appeals ? "warn" : "muted"} />
                            <Cell label="랭킹 제외" value={f.rankVoid} tone={f.rankVoid ? "warn" : "muted"} />
                            <Cell label="사진" value={f.photos} />
                        </div>
                        <Line>장비 {f.gear} · 수족관 장식 {f.decor} · 정출에 붙인 조과 {f.onTrips} · 낚시 크루 {f.crews}{f.lastDay ? <span className="text-black/40"> · 마지막 기록 {f.lastDay}</span> : null}</Line>
                        {f.recent.length > 0 && (
                            <ul className="mt-2.5 border-t border-black/[0.06] divide-y divide-black/[0.05]" data-testid="member-fishing-recent">
                                {f.recent.map((c) => (
                                    <li key={c.id} className="flex items-center gap-2.5 py-2">
                                        {c.thumbUrl
                                            ? <img src={c.thumbUrl} alt="" loading="lazy" draggable={false} className={`h-9 w-9 shrink-0 rounded-lg object-cover ${c.hidden ? "opacity-40" : ""}`} />
                                            : <span aria-hidden className="h-9 w-9 shrink-0 rounded-lg bg-black/[0.05]" />}
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] font-bold text-[rgba(0,0,0,0.87)]">{c.species} <span className="font-normal text-black/50 tabular-nums">{catchSize(c)}</span></span>
                                            <span className="block truncate text-[11.5px] text-black/45">{c.day} · {c.place || "장소 없음"}{c.onTrip ? " · 정출" : ""}</span>
                                        </span>
                                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                                            {c.hidden ? <Pill tone="alert">{c.appealed ? "이의제기" : "가려짐"}</Pill> : c.isPublic ? <Pill tone="info">공개</Pill> : <Pill tone="neutral">나만</Pill>}
                                            {c.rankVoid && <Pill tone="warn">랭킹 제외</Pill>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {f.catches > f.recent.length && <p className="pt-1 text-[11px] text-black/35">최근 {f.recent.length}건만 보입니다.</p>}
                    </Card>
                )}
                {empty.length > 0 && (
                    <p className="rounded-2xl bg-white border border-black/[0.07] px-4 py-3 text-[12.5px] text-black/45">기록 없음 — {empty.map((k) => GOODS_SPORT_NAME[k]).join(" · ")}</p>
                )}
                <p className="text-[11.5px] leading-snug break-keep text-black/40">보기만 합니다. 고치는 일은 각 종목 메뉴에서(조과 검수 · 랭킹 점검 · 장식 · 정상 인증 · 큐 케이스 · 굿즈 · 배지). 조과 · 표시 지점의 좌표는 여기 싣지 않습니다.</p>
            </div>
        </section>
    );
}
