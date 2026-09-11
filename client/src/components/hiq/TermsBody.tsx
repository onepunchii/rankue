import { Fragment } from "react";
import { TERMS_CONTACT_EMAIL, type TermsDoc } from "@shared/termsContent";

// 이용약관 본문 렌더러 — /terms 페이지와 동의 시트의 '전문 보기'가 같이 쓴다(원문은 shared/termsContent.ts).
// 본문 속 이메일과 문서 경로(/privacy, /account-delete)는 눌러서 갈 수 있게 링크로 바꾼다.

const LINK_RE = new RegExp(`(${TERMS_CONTACT_EMAIL.replace(/[.@]/g, "\\$&")}|/account-delete|/privacy)`, "g");

function Linkified({ text }: { text: string }) {
    // split 에 캡처 그룹을 쓰면 찾은 조각이 홀수 칸에 들어온다
    const parts = text.split(LINK_RE);
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <a key={i} className="underline" href={part.includes("@") ? `mailto:${part}` : part}>
                        {part}
                    </a>
                ) : (
                    <Fragment key={i}>{part}</Fragment>
                ),
            )}
        </>
    );
}

export function TermsBody({ doc, compact = false }: { doc: TermsDoc; compact?: boolean }) {
    const h2 = compact ? "mt-5 text-[14px] font-bold text-gray-900" : "mt-8 text-lg font-bold";
    const text = compact ? "text-[13px] text-gray-700" : "text-sm text-gray-700";
    return (
        <div className="leading-relaxed">
            <p className={`${compact ? "" : "mt-6 "}${text}`}>{doc.intro}</p>
            {doc.sections.map((section) => (
                <section key={section.title}>
                    <h2 className={h2}>{section.title}</h2>
                    {section.body.map((block, i) =>
                        Array.isArray(block) ? (
                            <ul key={i} className={`mt-2 list-disc pl-5 space-y-1 ${text}`}>
                                {block.map((item) => (
                                    <li key={item}><Linkified text={item} /></li>
                                ))}
                            </ul>
                        ) : (
                            <p key={i} className={`mt-2 ${text}`}><Linkified text={block} /></p>
                        ),
                    )}
                </section>
            ))}
            <p className={compact ? "mt-5 text-[12px] text-gray-400" : "mt-10 text-xs text-gray-400"}>{doc.effective}</p>
        </div>
    );
}
