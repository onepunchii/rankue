/**
 * 홈의 실전 점수판(2026-10-24 오너: "점수판 부분이 살짝 헷갈리는데 사람들이 '아 이게 실전 점수판이구나' 느낄 수 있는 디자인" → 시안 ② "좋네 진행").
 * 홈 시안 B(?home=b)에서 예전 노란 점수판 카드(ScoreboardActions — 내 다마 판 + 점수판 + 혼자 연습 · PIN)를 대신한다.
 * 판의 숫자는 화면 미리 보기다(내 경기가 아니다) — 오른쪽 위에 '미리 보기'. 입구는 예전과 같은 두 함수(홈의 handleStartGameClick · handleJoinGameClick — 비로그인은 거기서 가입 안내).
 *
 * 2026-10-28 오너 "우리 점수판 디자인 느낌을 더 살리면서 · 여기에 내 핸디 점수 들어가면 좋지 · 너무 이 디자인을 할 필요 없고 느낌만"
 * → 실제 점수판(/game/:id — PlayerCard · ScoreboardBottomBar)의 결만 옮겼다: 칸마다 머리 띠(이름 · 목표) · 가운데 큰 점수와 그 위를 가르는 줄 ·
 * 바닥 띠(평균 · 하이런 | 남은 점수 초록) · 차례인 칸은 짙은 테두리, 아닌 칸은 회색 · 두 칸 사이 아래의 초록 이닝 공.
 * 내 칸의 이름 · 목표(내 다마) · 평균 · 하이런은 내 실전 3쿠션 기록(compare/real — '내 실력' 카드와 같은 캐시), 다마가 없으면 예시 숫자. 비로그인은 예시 인물(sample).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import type { RealCompareResponse } from "@shared/proCompare";
import type { GuestSampleBilliards } from "@shared/guestSample";

// 실제 점수판 밝은 판의 색 — 차례 테두리(첫 선수는 흰 공이라 짙은 남회색) · 남은 점수와 이닝 공의 초록
const TURN_INK = "#303B4B";
const BOARD_GREEN = "#1F6B47";
// 미리 보기 장면 — 내 남은 점수 7, 상대 20점 중 14(실제 점수판 안내 사진과 같은 장면)
const MY_LEFT = 7;

type Labels = { target: string; avg: string; run: string };

// inner: 가운데(이닝 공) 쪽 — 바닥 띠의 그쪽 끝을 비워 공이 남은 점수 · 글자를 가리지 않게
function Half({ name, target, score, avg, run, turn, labels, inner }: { name: string; target: number; score: number; avg: string; run: number | string; turn: boolean; labels: Labels; inner: "l" | "r" }) {
    const band = { background: "rgba(0,0,0,.035)", borderColor: turn ? TURN_INK : "rgba(0,0,0,.1)" };
    const strong = turn ? "text-[#1d232c]" : "text-black/35";
    return (
        <div className={`relative min-w-0 flex-1 overflow-hidden rounded-xl ${turn ? "bg-white" : "bg-[#E6E4DF]"}`}
            style={{ boxShadow: turn ? `inset 0 0 0 3px ${TURN_INK}` : "inset 0 0 0 1px rgba(0,0,0,.06)" }}>
            {/* 머리 띠 — 이름 · 목표 */}
            <div className="flex items-start justify-between gap-1 border-b px-2.5 pb-1.5 pt-2" style={band}>
                <span className={`truncate text-[15px] font-bold leading-tight ${strong}`}>{name}</span>
                <span className="shrink-0 text-right leading-none">
                    <span className="block text-[10px] font-medium text-black/40">{labels.target}</span>
                    <span className={`block text-[14px] font-semibold rk-num ${turn ? "text-black/70" : "text-black/30"}`}>{target}</span>
                </span>
            </div>
            {/* 가운데 — 큰 점수와 그 위를 가르는 줄(넘김판 느낌) */}
            <div className="relative grid h-[78px] place-items-center">
                <i className="absolute inset-x-0 top-1/2 h-px bg-black/10" aria-hidden="true" />
                <span className="relative text-[56px] font-bold leading-none rk-num" style={{ color: turn ? TURN_INK : "rgba(0,0,0,.18)" }}>{score}</span>
            </div>
            {/* 바닥 띠 — 평균 · 하이런 | 남은 점수 */}
            <div className={`flex items-end justify-between gap-1 border-t pb-2 pt-1.5 ${inner === "r" ? "pl-2.5 pr-7" : "pl-7 pr-2.5"}`} style={band}>
                <span className="min-w-0 text-[10.5px] font-medium leading-[1.4] text-black/45 rk-num">
                    <span className="block truncate">{labels.avg} <b className={`text-[12.5px] ${strong}`}>{avg}</b></span>
                    <span className="block truncate">{labels.run} <b className={`text-[12.5px] ${strong}`}>{run}</b></span>
                </span>
                <span className="text-[30px] font-bold leading-none rk-num" style={{ color: turn ? BOARD_GREEN : "rgba(0,0,0,.3)" }}>{Math.max(0, target - score)}</span>
            </div>
        </div>
    );
}

export function ScoreboardHero({ onStart, onJoin, sample }: { onStart: (mode: "practice" | "match") => void; onJoin: () => void; sample?: GuestSampleBilliards | null }) {
    const { t } = useT();
    const { member } = useAuth();
    const real = useQuery<RealCompareResponse>({ queryKey: ["/api/hiq/compare/real"], enabled: !!member && !sample, staleTime: 60_000, retry: false });
    const side = (sample ? sample.real : real.data)?.["3c"];
    const handi = side?.ready && side.handi ? side.handi : null;
    const target = handi ?? 25;
    const myName = sample ? t(sample.nameKey) : member?.name || t("home.boardMe");
    const labels: Labels = { target: t("playerCard.target"), avg: t("playerCard.average"), run: t("playerCard.highRun") };
    return (
        <div data-testid="home-scoreboard">
            <div className="overflow-hidden rounded-[26px] p-3" style={{ background: "linear-gradient(180deg,#1A1D21 0%,#0E1012 100%)", boxShadow: "0 12px 28px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)" }}>
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold tracking-[0.12em] text-[#F5B721]"><i className="h-1.5 w-1.5 rounded-full bg-[#F5B721]" aria-hidden="true" />SCOREBOARD</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] font-bold text-white/75 rk-num">
                        {t("home.boardPreview")}{handi ? ` · ${t("home.skillDama").replace("{n}", String(handi))}` : ""}
                    </span>
                </div>
                {/* 실제 점수판의 결 — 두 칸 + 가운데 아래 이닝 공 */}
                <div className="relative rounded-2xl bg-[#F4F3EF] p-1.5 pb-7" aria-hidden="true">
                    <div className="flex gap-1.5">
                        <Half name={myName} target={target} score={target - MY_LEFT} turn labels={labels} inner="r"
                            avg={typeof side?.avg === "number" ? side.avg.toFixed(2) : "0.62"} run={side?.highRun ?? 5} />
                        <Half name={t("home.boardOpp")} target={20} score={14} avg="0.55" run={4} turn={false} labels={labels} inner="l" />
                    </div>
                    <span className="absolute bottom-[3px] left-1/2 grid h-[50px] w-[50px] -translate-x-1/2 place-items-center rounded-full border-[3px] bg-white text-center leading-none shadow-[0_1px_3px_rgba(0,0,0,.12)]" style={{ borderColor: BOARD_GREEN }}>
                        <span>
                            <span className="block text-[9.5px] font-medium text-black/45">{t("scoreboardBottomBar.inning")}</span>
                            <span className="mt-0.5 block text-[19px] font-bold rk-num" style={{ color: BOARD_GREEN }}>12</span>
                        </span>
                    </span>
                </div>
                <button type="button" onClick={() => onStart("match")} data-track-as="홈 실전 점수판 경기 시작" data-testid="home-scoreboard-start"
                    className="mt-3 h-12 w-full rounded-full bg-[#F5B721] text-[15px] font-black text-[#2d1a08] active:opacity-90">{t("home.boardStart")} ▶</button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => onStart("practice")} data-track-as="홈 실전 점수판 혼자 연습" className="h-10 rounded-full border border-white/15 text-[13px] font-bold text-white/85 active:bg-white/10">{t("home.boardPractice")}</button>
                    <button type="button" onClick={onJoin} data-track-as="홈 실전 점수판 PIN" className="h-10 rounded-full border border-white/15 text-[13px] font-bold text-white/85 active:bg-white/10">{t("home.boardPin")}</button>
                </div>
            </div>
            <p className="mt-2 px-1 text-[11.5px] leading-snug text-ink-4">{t("home.boardFoot")}</p>
        </div>
    );
}
