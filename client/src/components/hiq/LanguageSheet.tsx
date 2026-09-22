/**
 * 언어 고르기 시트(2026-09-22 오너: "홈에 알림·전체 사이에 언어 아이콘"). 설정 화면의 언어 칸과 같은 setLocale 을 쓴다.
 * 각 줄은 **그 언어의 자기 이름**을 크게(고르는 사람이 읽을 수 있어야 한다), 지금 언어로 본 이름을 작게. 국기는 안 쓴다 —
 * 스페인어는 여러 나라가 쓰고, 국기가 붙으면 흔한 자동 생성 앱처럼 보인다. 누르면 바로 바뀌고 닫힌다(저장 단추 없음).
 * 골프는 한국어에서만 열리므로(useGolfAccess) 그 사실을 한 줄 적어 둔다.
 */
import { LucideCheck, LucideLanguages } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LOCALES, useT, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const { t, locale, setLocale } = useT();
    const pick = (l: Locale) => { setLocale(l); onOpenChange(false); };
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="px-5 pt-5 pb-3 text-left">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1 flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center"><LucideLanguages className="w-4 h-4 text-brand" /></span>
                        {t("lang.title")}
                    </SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3">{t("lang.desc")}</SheetDescription>
                </SheetHeader>
                <ul className="px-3 pb-2">
                    {LOCALES.map((l) => {
                        const on = locale === l.code;
                        return (
                            <li key={l.code}>
                                <button
                                    type="button" onClick={() => pick(l.code)} aria-pressed={on} lang={l.code}
                                    className={cn("w-full h-14 px-4 rounded-xl flex items-center gap-3 text-left transition-colors", on ? "bg-brand/10" : "active:bg-surface-2")}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className={cn("block text-[15px] font-semibold", on ? "text-brand" : "text-ink-1")}>{l.label}</span>
                                        {l.code !== locale && <span className="block text-[11.5px] font-medium text-ink-4">{t(l.sub)}</span>}
                                    </span>
                                    <span className={cn("w-6 h-6 rounded-full flex items-center justify-center", on ? "bg-brand text-brand-fg" : "border border-surface-line-strong")}>
                                        {on && <LucideCheck className="w-4 h-4" />}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                <p className="px-5 pb-5 text-[11.5px] font-medium text-ink-4">{t("lang.golfKoreaOnly")}</p>
            </SheetContent>
        </Sheet>
    );
}
