/**
 * 홈의 큐 케이스 입구(2026-10-16) — 내 실전 기록 바로 아래. 가죽 케이스를 연 모습 그대로: 금실 바느질 · 벨벳 자리 두 줄에 대표 큐.
 * 받은 수는 GET /cue-case/summary(받은 기록만 읽는 가벼운 답). 한 번도 안 열었으면 '열어 보세요' — 옛 기록으로 이미 들어와 있을 수 있다.
 * 비로그인은 빈 자리 둘과 "큐 77자루 …" — 눌러 들어가면 큐 케이스가 가입을 권한다.
 */
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { CUES, caseImage, caseItem } from "@shared/cueCase";
import { cueCasePath, readCaseSeen, useCaseSummary } from "./cueCaseApi";

/** 빈 자리에 비치는 모양 — 늘 같은 두 자루(바뀌면 홈이 매번 달라 보인다) */
const GHOSTS = ["cue-najeon-crane", "cue-on-tier-diamond"].map((id) => caseItem(id) ?? CUES[0]);

export function CueCaseEntry() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const q = useCaseSummary(!!member);
    const s = q.data;
    const hero = s?.hero ? caseItem(s.hero) : null;
    // 이 기기에서 큐 케이스를 마지막으로 연 뒤에 들어온 것이 있으면 '새로'
    const fresh = !!s?.latest && s.latest > readCaseSeen();
    const sub = !member ? t("case.entryGuest")
        : s?.opened ? t("case.entryCounts").replace("{c}", String(s.cue)).replace("{k}", String(s.chalk)).replace("{g}", String(s.glove))
            : t("case.entryOpen");
    return (
        <button type="button" onClick={() => setLocation(cueCasePath())} data-testid="cue-case-entry" data-track-as="홈 큐 케이스"
            className="cue-case cc-entry mt-4 block w-full overflow-hidden rounded-[24px] px-4 pb-4 pt-4 text-left active:opacity-95">
            <span className="relative flex items-center gap-2 px-1.5">
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[16px] font-semibold tracking-tight text-[#f4ead6]">
                        {t("case.entryTitle")}
                        {fresh && <span className="rounded-full bg-[#e8c46a] px-1.5 py-[1px] text-[11.5px] font-bold text-[#2d1a08]" data-testid="cue-case-entry-new">{t("case.new")}</span>}
                    </span>
                    <span className="rk-num mt-0.5 block truncate text-[12.5px] text-[#e8c46a]">{sub}</span>
                </span>
                <span className="shrink-0 text-[18px] font-semibold text-[#f4ead6]/60" aria-hidden>›</span>
            </span>
            <span className="relative mt-3 block space-y-2 rounded-[18px] bg-[#0b1322] p-2" style={{ boxShadow: "inset 0 2px 8px rgba(0,0,0,0.7)" }}>
                <span className="cc-slot block !h-[30px]">
                    <img src={caseImage(hero ?? GHOSTS[0])} alt="" decoding="async" draggable={false} className={hero ? "cc-own" : "cc-ghost"} />
                </span>
                <span className="cc-slot block !h-[30px] opacity-80">
                    <img src={caseImage(GHOSTS[1])} alt="" decoding="async" draggable={false} className="cc-ghost" />
                </span>
            </span>
        </button>
    );
}

export default CueCaseEntry;
