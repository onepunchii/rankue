import { useState, useEffect } from 'react';
import { LucidePlus, LucideTrash2, LucideLayout, LucideLoader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CrewData } from '@/types/crew';
import { useT } from '@/lib/i18n';

interface ClubIntroTemplateTabProps {
    crew: CrewData;
    isLeader: boolean;
    onUpdate: (data: any) => void;
    isUpdating: boolean;
}

export function ClubIntroTemplateTab({ crew, isLeader, onUpdate, isUpdating }: ClubIntroTemplateTabProps) {
    const { t } = useT();
    const [questions, setQuestions] = useState(crew?.introQuestions || []);

    // Re-seed local state when a DIFFERENT crew is passed in (switching crews while this tab
    // stays mounted). Without this, `questions` kept the first crew's values and the form showed
    // stale data. Keyed on crew.id so it doesn't clobber the user's in-progress edits mid-session.
    useEffect(() => {
        setQuestions(crew?.introQuestions || []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [crew?.id]);

    const isDirty = JSON.stringify(questions) !== JSON.stringify(crew?.introQuestions || []);

    const addQuestion = () => {
        setQuestions([...questions, { id: Math.random().toString(36).substr(2, 9), text: '', required: false }]);
    };

    const removeQuestion = (id: string) => {
        setQuestions(questions.filter(q => q.id !== id));
    };

    const updateQuestion = (id: string, text: string) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, text } : q));
    };

    const toggleRequired = (id: string) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, required: !q.required } : q));
    };

    const handleSave = () => {
        onUpdate({ introQuestions: questions });
    };

    return (
        <div className="space-y-6 pb-6">
            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <div className="space-y-0.5">
                        <h3 className="text-sm font-bold text-[rgba(0,0,0,0.87)]">{t("clubIntroTemplateTab.title")}</h3>
                        <p className="text-xs text-black/55 font-medium">{t("clubIntroTemplateTab.subtitle")}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    {questions.map((q, idx) => (
                        <div key={q.id} className="group relative bg-surface-3 p-4 rounded-tile flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-brand flex items-center gap-1.5">
                                    <LucideLayout className="w-3.5 h-3.5" />
                                    {t("clubIntroTemplateTab.question")} {idx + 1}
                                </span>
                                {isLeader && (
                                    <button
                                        onClick={() => removeQuestion(q.id)}
                                        className="p-1 px-2 text-xs font-bold text-red-600/80 hover:text-red-600 transition-colors"
                                    >
                                        {t("clubIntroTemplateTab.delete")}
                                    </button>
                                )}
                            </div>

                            <Input
                                value={q.text}
                                onChange={(e) => updateQuestion(q.id, e.target.value)}
                                disabled={!isLeader}
                                placeholder={t("clubIntroTemplateTab.questionPlaceholder")}
                                className="bg-white border-surface-line h-10 text-sm font-medium rounded-tile focus:ring-0 placeholder:text-black/40"
                            />

                            <div className="flex items-center gap-2 px-1">
                                <Checkbox
                                    id={`req-${q.id}`}
                                    checked={q.required}
                                    onCheckedChange={() => toggleRequired(q.id)}
                                    disabled={!isLeader}
                                    className="border-black/20 data-[state=checked]:bg-brand data-[state=checked]:border-brand"
                                />
                                <Label
                                    htmlFor={`req-${q.id}`}
                                    className="text-xs font-medium text-black/55 cursor-pointer select-none"
                                >
                                    {t("clubIntroTemplateTab.requiredAnswer")}
                                </Label>
                            </div>
                        </div>
                    ))}

                    {questions.length === 0 && !isLeader && (
                        <div className="p-6 bg-surface-3 rounded-tile flex flex-col items-center justify-center gap-2 text-center">
                            <LucideLayout className="w-6 h-6 text-black/40" />
                            <p className="text-xs font-medium text-black/40">{t("clubIntroTemplateTab.noQuestions")}</p>
                        </div>
                    )}

                    {isLeader && (
                        <button
                            onClick={addQuestion}
                            className="w-full h-14 rounded-tile border-2 border-dashed border-surface-line flex items-center justify-center gap-2 hover:bg-black/[0.04] transition-colors text-black/55 hover:text-[rgba(0,0,0,0.87)] group active:scale-[0.98]"
                        >
                            <LucidePlus className="w-4 h-4" />
                            <span className="text-xs font-semibold">
                                {questions.length === 0 ? t("clubIntroTemplateTab.addFirstQuestion") : t("clubIntroTemplateTab.addQuestion")}
                            </span>
                        </button>
                    )}
                </div>

                <div className="pt-4">
                    {isLeader ? (
                        <Button
                            onClick={handleSave}
                            disabled={!isDirty || isUpdating}
                            className="w-full h-12 text-brand-fg rounded-tile font-bold text-sm transition-colors active:scale-[0.98] disabled:opacity-30 bg-brand hover:bg-brand-strong"
                        >
                            {isUpdating ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : t("clubIntroTemplateTab.saveTemplate")}
                        </Button>
                    ) : (
                        <div className="p-4 bg-surface-3 rounded-tile text-center text-xs font-medium text-black/55 leading-relaxed">
                            {t("clubIntroTemplateTab.leaderOnlyNotice")}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
