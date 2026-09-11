import { useEffect, useState } from "react";
import { useSeo } from "@/hooks/useSeo";
import { useT } from "@/lib/i18n";
import { TERMS_CONTENT, termsLang, type TermsLang } from "@shared/termsContent";
import { TermsBody } from "@/components/hiq/TermsBody";

// 이용약관(EULA) — App Store 1.2 · Play UGC 심사용 공개 문서 페이지(감사 S4).
// /privacy 와 같은 틀: 로그인 게이트 없는 완전 공개 라우트, 흰 배경의 읽기용 문서.
// 한국어가 정본이고, 한국어가 아닌 앱 언어는 영어본을 보여 준다(원문은 shared/termsContent.ts).
export default function Terms() {
    const { locale } = useT();
    const [lang, setLang] = useState<TermsLang>(() => termsLang(locale));
    // 앱 언어는 사전을 불러온 뒤에 정해질 수 있다 — 사용자가 직접 언어를 바꾸기 전까지는 앱 언어를 따라간다
    const [picked, setPicked] = useState(false);
    useEffect(() => {
        if (!picked) setLang(termsLang(locale));
    }, [locale, picked]);

    const doc = TERMS_CONTENT[lang];
    useSeo({ title: doc.seoTitle, description: doc.seoDescription, path: "/terms", locale: lang });

    // 설정·가입 화면에서 들어온 경우 돌아갈 곳이 있다. 주소창으로 바로 연 경우엔 버튼을 숨긴다.
    const canGoBack = typeof window !== "undefined" && window.history.length > 1;

    return (
        <div className="min-h-screen w-full bg-white text-gray-900">
            <div className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
                <div className="flex items-center justify-between gap-3">
                    {canGoBack ? (
                        <button onClick={() => window.history.back()} className="text-sm font-medium text-gray-500 underline-offset-2 hover:underline">
                            ← {doc.back}
                        </button>
                    ) : <span />}
                    <button
                        onClick={() => { setPicked(true); setLang(lang === "ko" ? "en" : "ko"); }}
                        className="h-8 px-3 rounded-full border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                        {doc.switchLabel}
                    </button>
                </div>

                <h1 className="mt-6 text-2xl font-bold">{doc.title}</h1>
                <p className="mt-2 text-sm text-gray-500">{doc.meta}</p>

                <TermsBody doc={doc} />

                <h2 className="mt-10 text-lg font-bold">{doc.related}</h2>
                <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
                    <li><a className="underline" href="/privacy">{doc.privacyLabel}</a></li>
                    <li><a className="underline" href="/account-delete">{doc.accountDeleteLabel}</a></li>
                    <li><a className="underline" href="/support">{doc.supportLabel}</a></li>
                </ul>
            </div>
        </div>
    );
}
