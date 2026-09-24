/**
 * 당구 용어 사전(/billiards/terms) 두 화면이 같이 쓰는 머리줄·안내 조각.
 * 본문(shared/billiardsTerms)은 여기서 부르지 않는다 — 이 파일은 가볍게 두고 글은 페이지 청크에만 싣는다.
 */
import type { ReactNode } from "react";
import { LucideChevronLeft } from "@/lib/icons";
import { useT, type Locale } from "@/lib/i18n";

/** 둥근 흰 뒤로 단추 + 제목 — world-player·pba 머리줄과 같은 모양 */
export function TermsHeader({ title, onBack, backLabel, right }: { title: string; onBack: () => void; backLabel: string; right?: ReactNode }) {
    return (
        <div className="flex items-center gap-3 mb-5">
            <button
                type="button"
                onClick={onBack}
                aria-label={backLabel}
                className="w-11 h-11 shrink-0 rounded-full bg-surface-1 flex items-center justify-center text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-95 transition-transform"
            >
                <LucideChevronLeft className="w-5 h-5" />
            </button>
            <p className="flex-1 min-w-0 truncate text-[17px] font-bold text-ink-1">{title}</p>
            {right}
        </div>
    );
}

// 사전 본문은 한국어로만 쓴다(한국 당구장 말이라 번역하면 뜻이 흐려진다). 다른 언어로 앱을 쓰는 사람에게 그 사실만 알린다.
const KO_ONLY: Record<Exclude<Locale, "ko">, string> = {
    en: "This billiards glossary is available in Korean only.",
    vi: "Từ điển thuật ngữ bida này chỉ có bằng tiếng Hàn.",
    tr: "Bu bilardo sözlüğü yalnızca Korece olarak sunulmaktadır.",
    es: "Este glosario de billar solo está disponible en coreano.",
};

export function KoreanOnlyNote() {
    const { locale } = useT();
    if (locale === "ko") return null;
    return <p lang={locale} className="mb-4 rounded-2xl bg-surface-3 px-4 py-3 text-[13px] font-medium text-ink-2">{KO_ONLY[locale]}</p>;
}
