import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LucideCheck } from "@/lib/icons";
import { optionClass } from "./formKit";

/**
 * 크루 성향 칸(주 종목·분위기 태그·가입 방식) — 만들기 3단계와 설정 '정보' 탭이 같은 부품을 쓴다(2026-09-26).
 * 예전엔 두 화면에 같은 목록이 복사돼 있었고(골프 태그는 한국어 문자열 하드코딩), 버튼 높이가 32px 남짓이었다.
 */

const GAME_TYPES: Record<"GOLF" | "BILLIARDS", Array<{ id: string; label: string }>> = {
    GOLF: [
        { id: "any", label: "createClub.gameAny" },
        { id: "field", label: "createClub.gameField" },
        { id: "screen", label: "createClub.gameScreen" },
        { id: "range", label: "createClub.gameRange" },
    ],
    BILLIARDS: [
        { id: "any", label: "createClub.gameAny" },
        { id: "3c", label: "createClub.game3c" },
        { id: "4c", label: "createClub.game4c" },
        { id: "pocket", label: "createClub.gamePocket" },
    ],
};

const sportKey = (sport?: string | null) => (sport === "GOLF" ? "GOLF" : "BILLIARDS");

export function GameTypePicker({ sport, value, onChange, disabled }: {
    sport?: string | null;
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
}) {
    const { t } = useT();
    return (
        <div className="grid grid-cols-2 gap-2" role="group">
            {GAME_TYPES[sportKey(sport)].map((g) => (
                <button key={g.id} type="button" disabled={disabled} aria-pressed={value === g.id} onClick={() => onChange(g.id)} className={optionClass(value === g.id, "w-full rounded-tile")}>
                    {t(g.label)}
                </button>
            ))}
        </div>
    );
}

/**
 * 추천 태그 — 언어별 목록(사전에 쉼표로 이어 둔다). "#내기환영" 은 뺐다 — 앱이 금전 내기를 권하는 모양이 된다
 * (감사 S5, shared/crewTags.ts). 골프 목록도 이제 사전 키다(예전엔 한국어 배열이 두 화면에 박혀 있었다).
 */
export function suggestedTags(t: (k: string) => string, sport?: string | null): string[] {
    const raw = sportKey(sport) === "GOLF" ? t("crewMgmt.golfTags") : t("clubSettings.billiardsTags");
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function TagPicker({ sport, value, onChange, disabled, max = 3 }: {
    sport?: string | null;
    value: string[];
    onChange: (v: string[]) => void;
    disabled?: boolean;
    max?: number;
}) {
    const { t } = useT();
    // 이미 저장된 태그가 지금 언어 추천 목록에 없어도(다른 언어로 만든 크루) 보이고 뺄 수 있게 앞에 둔다.
    const options = Array.from(new Set([...value, ...suggestedTags(t, sport)]));
    const full = value.length >= max;
    return (
        <div className="flex flex-wrap gap-2" role="group">
            {options.map((tag) => {
                const selected = value.includes(tag);
                return (
                    <button
                        key={tag}
                        type="button"
                        disabled={disabled || (!selected && full)}
                        aria-pressed={selected}
                        onClick={() => onChange(selected ? value.filter((x) => x !== tag) : [...value, tag])}
                        className={optionClass(selected)}
                    >
                        {tag}
                    </button>
                );
            })}
        </div>
    );
}

export function JoinTypePicker({ value, onChange, disabled }: {
    value: "auto" | "approval";
    onChange: (v: "auto" | "approval") => void;
    disabled?: boolean;
}) {
    const { t } = useT();
    const options = [
        { id: "auto" as const, title: "createClub.joinAutoTitle", desc: "createClub.joinAutoDesc" },
        { id: "approval" as const, title: "createClub.joinApprovalTitle", desc: "createClub.joinApprovalDesc" },
    ];
    return (
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {options.map((o) => {
                const on = value === o.id;
                return (
                    <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => onChange(o.id)}
                        className={cn(
                            "min-h-11 p-3 rounded-tile border text-left flex flex-col gap-0.5 transition-colors disabled:opacity-50",
                            on ? "border-brand bg-brand/5" : "border-surface-line bg-surface-1 active:bg-surface-3",
                        )}
                    >
                        <span className={cn("text-[15px] font-semibold inline-flex items-center gap-1", on ? "text-brand" : "text-ink-1")}>
                            {on && <LucideCheck className="w-4 h-4" />}
                            {t(o.title)}
                        </span>
                        <span className="text-[12px] font-medium text-ink-3">{t(o.desc)}</span>
                    </button>
                );
            })}
        </div>
    );
}
