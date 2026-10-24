/**
 * 홈의 실전 점수판(2026-10-24 오너: "점수판 부분이 살짝 헷갈리는데 사람들이 '아 이게 실전 점수판이구나' 느낄 수 있는 디자인" → 시안 ② "좋네 진행").
 * 홈 시안 B(?home=b)에서 예전 노란 점수판 카드(ScoreboardActions — 내 다마 판 + 점수판 + 혼자 연습 · PIN)를 대신한다.
 * 실제 점수판 화면(/game/:id — 공 색 두 칸 · 큰 점수 · 차례 · 이닝)을 그대로 줄인 판이라 눌러 들어가면 같은 모양이 나온다.
 * 판의 숫자는 화면 미리 보기다(내 경기가 아니다) — 오른쪽 위에 '미리 보기'. 내 다마는 맨 위 '내 실력' 카드로 옮겼다.
 * 입구는 예전과 같은 두 함수(홈의 handleStartGameClick · handleJoinGameClick — 비로그인은 거기서 가입 안내).
 */
import { useT } from "@/lib/i18n";

function Half({ ball, ink, name, score, line, turn, turnLabel }: { ball: string; ink: string; name: string; score: number; line: string; turn: boolean; turnLabel: string }) {
    return (
        <div className={`relative min-w-0 flex-1 rounded-2xl p-3 ${turn ? "bg-white/[0.07] ring-1 ring-white/15" : ""}`}>
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-white/80">
                <i className="h-3 w-3 shrink-0 rounded-full" style={{ background: ball, boxShadow: "inset -2px -2px 3px rgba(0,0,0,.35)" }} aria-hidden="true" />
                <span className="truncate">{name}</span>
                {turn && <span className="ml-auto shrink-0 rounded-full bg-[#F5B721] px-1.5 text-[10.5px] font-black text-[#2d1a08]">{turnLabel}</span>}
            </p>
            <p className="mt-1 text-[60px] font-black leading-none rk-num" style={{ color: ink }}>{score}</p>
            <p className="mt-1 truncate text-[11.5px] font-semibold text-white/45 rk-num">{line}</p>
        </div>
    );
}

export function ScoreboardHero({ onStart, onJoin }: { onStart: (mode: "practice" | "match") => void; onJoin: () => void }) {
    const { t } = useT();
    const line = (target: number, run: number) => t("home.boardLine").replace("{t}", String(target)).replace("{h}", String(run));
    return (
        <div data-testid="home-scoreboard">
            <div className="overflow-hidden rounded-[26px] p-3" style={{ background: "linear-gradient(180deg,#1A1D21 0%,#0E1012 100%)", boxShadow: "0 12px 28px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.06)" }}>
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold tracking-[0.12em] text-[#F5B721]"><i className="h-1.5 w-1.5 rounded-full bg-[#F5B721]" aria-hidden="true" />SCOREBOARD</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11.5px] font-bold text-white/75 rk-num">{t("home.boardPreview")} · {t("home.boardInning").replace("{n}", "12")}</span>
                </div>
                {/* 실제 점수판과 같은 색 — 흰 공 · 노란 공(다크 모드의 공 색) */}
                <div className="flex gap-2" aria-hidden="true">
                    <Half ball="#F2EFE8" ink="#F4F1EA" name={t("home.boardMe")} score={18} line={line(23, 5)} turn turnLabel={t("home.boardTurn")} />
                    <Half ball="#F3C531" ink="#FACC15" name={t("home.boardOpp")} score={15} line={line(20, 4)} turn={false} turnLabel="" />
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
