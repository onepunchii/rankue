import { useState, useEffect } from 'react';
import { LucidePlus, LucideTrash2, LucideLayout, LucideLoader2 } from '@/lib/icons';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { CrewData } from '@/types/crew';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { CREW_BTN, CREW_CARD, CREW_TEXT, CrewEmpty, IconButton } from '@/components/hiq/crew-ui';
import { FIELD_INPUT } from './formKit';

interface ClubIntroTemplateTabProps {
    crew: CrewData;
    isLeader: boolean;
    onUpdate: (data: any) => void;
    isUpdating: boolean;
}

const QUESTION_MAX = 100;

export function ClubIntroTemplateTab({ crew, isLeader, onUpdate, isUpdating }: ClubIntroTemplateTabProps) {
    const { t } = useT();
    const [questions, setQuestions] = useState(crew?.introQuestions || []);
    // 저장을 한 번 눌러 본 뒤에만 빈 칸을 빨갛게 — 방금 추가한 빈 질문을 곧바로 오류로 그리지 않는다.
    const [triedSave, setTriedSave] = useState(false);

    // Re-seed local state when a DIFFERENT crew is passed in (switching crews while this tab
    // stays mounted). Without this, `questions` kept the first crew's values and the form showed
    // stale data. Keyed on crew.id so it doesn't clobber the user's in-progress edits mid-session.
    useEffect(() => {
        setQuestions(crew?.introQuestions || []);
        setTriedSave(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crew?.id]);

    const isDirty = JSON.stringify(questions) !== JSON.stringify(crew?.introQuestions || []);
    // 빈 질문은 저장하지 않는다 — 예전엔 빈 칸이 그대로 저장돼 가입 신청 화면에 제목 없는 필수 질문이 떴다.
    const blankIds = new Set(questions.filter((q) => !q.text.trim()).map((q) => q.id));

    const addQuestion = () => {
        setQuestions([...questions, { id: Math.random().toString(36).slice(2, 11), text: '', required: false }]);
    };
    const removeQuestion = (id: string) => setQuestions(questions.filter((q) => q.id !== id));
    const updateQuestion = (id: string, text: string) => setQuestions(questions.map((q) => (q.id === id ? { ...q, text } : q)));
    const toggleRequired = (id: string) => setQuestions(questions.map((q) => (q.id === id ? { ...q, required: !q.required } : q)));

    const handleSave = () => {
        setTriedSave(true);
        if (blankIds.size > 0) return;
        onUpdate({ introQuestions: questions.map((q) => ({ ...q, text: q.text.trim() })) });
    };

    return (
        <div className="flex flex-col gap-4 pt-4">
            <div>
                <h3 className={CREW_TEXT.section}>{t("clubIntroTemplateTab.title")}</h3>
                <p className={cn(CREW_TEXT.sub, "mt-0.5")}>{t("clubIntroTemplateTab.subtitle")}</p>
            </div>

            {questions.length === 0 && !isLeader && (
                <CrewEmpty icon={<LucideLayout />} title={t("clubIntroTemplateTab.noQuestions")} />
            )}

            {questions.map((q, idx) => {
                const invalid = triedSave && blankIds.has(q.id);
                return (
                    <div key={q.id} className={cn(CREW_CARD, "flex flex-col gap-2 pr-2")}>
                        <div className="flex items-center justify-between gap-2">
                            <label htmlFor={`q-${q.id}`} className="text-[13px] font-semibold text-brand inline-flex items-center gap-1.5">
                                <LucideLayout className="w-4 h-4" />
                                {t("clubIntroTemplateTab.question")} {idx + 1}
                            </label>
                            {isLeader && (
                                <IconButton label={`${t("clubIntroTemplateTab.question")} ${idx + 1} ${t("clubIntroTemplateTab.delete")}`} tone="danger" onClick={() => removeQuestion(q.id)}>
                                    <LucideTrash2 />
                                </IconButton>
                            )}
                        </div>
                        <div className="pr-2 flex flex-col gap-1">
                            <Input
                                id={`q-${q.id}`}
                                value={q.text}
                                maxLength={QUESTION_MAX}
                                onChange={(e) => updateQuestion(q.id, e.target.value)}
                                disabled={!isLeader}
                                aria-invalid={invalid}
                                placeholder={t("clubIntroTemplateTab.questionPlaceholder")}
                                className={cn(FIELD_INPUT, invalid && "border-destructive focus-visible:border-destructive")}
                            />
                            {invalid && <p className="text-[12px] font-medium text-destructive" role="alert">{t("crewMgmt.questionBlank")}</p>}
                        </div>
                        <label htmlFor={`req-${q.id}`} className="flex items-center gap-2.5 min-h-11 cursor-pointer select-none">
                            <Checkbox
                                id={`req-${q.id}`}
                                checked={q.required}
                                onCheckedChange={() => toggleRequired(q.id)}
                                disabled={!isLeader}
                                className="w-5 h-5 border-surface-line data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                            />
                            <span className="text-[13px] font-medium text-ink-2">{t("clubIntroTemplateTab.requiredAnswer")}</span>
                        </label>
                    </div>
                );
            })}

            {isLeader && (
                <button
                    type="button"
                    onClick={addQuestion}
                    className="w-full h-14 rounded-card border-2 border-dashed border-surface-line flex items-center justify-center gap-2 text-ink-2 active:bg-surface-3"
                >
                    <LucidePlus className="w-4 h-4" />
                    <span className="text-[15px] font-semibold">
                        {questions.length === 0 ? t("clubIntroTemplateTab.addFirstQuestion") : t("clubIntroTemplateTab.addQuestion")}
                    </span>
                </button>
            )}

            <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-4 bg-surface-0 border-t border-surface-line">
                {isLeader ? (
                    <button type="button" onClick={handleSave} disabled={!isDirty || isUpdating} className={cn(CREW_BTN.primary, "w-full")}>
                        {isUpdating ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : t("clubIntroTemplateTab.saveTemplate")}
                    </button>
                ) : (
                    <p className="text-center text-[13px] font-medium text-ink-3">{t("clubIntroTemplateTab.leaderOnlyNotice")}</p>
                )}
            </div>
        </div>
    );
}
