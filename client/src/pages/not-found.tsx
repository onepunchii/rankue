/**
 * 없는 주소(2026-10-17 리뷰) — 예전에는 개발 틀의 영어 문구(404 와 라우터에 화면을 넣었느냐는 개발자용 질문)가
 * 그대로 회원에게 보였다. 옛 링크 · 잘못 친 주소로 온 사람에게 길을 알려 준다: 판화 한 장(빈 이정표 — 그림 속 글자 없음) · 다섯 언어 한 줄 · 홈 / 뒤로.
 * 미리보기 · 카카오 미리보기 등 다른 화면도 이 부품을 그대로 쓴다(import NotFound from "@/pages/not-found").
 */
import { useLocation } from "wouter";
import { useT } from "@/lib/i18n";
import { NOT_FOUND_ART as ART } from "@shared/pageCovers";

export default function NotFound() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const canBack = typeof window !== "undefined" && window.history.length > 1;
    return (
        <div className="min-h-screen w-full bg-surface-0 px-5 py-10 flex items-center justify-center" data-testid="not-found">
            <div className="w-full max-w-sm">
                <div className="overflow-hidden rounded-3xl shadow-[0_8px_24px_rgba(15,40,56,0.18)]">
                    <img src={ART} alt="" aria-hidden width={800} height={600} decoding="async" draggable={false} className="block aspect-[4/3] w-full object-cover" />
                </div>
                <p className="mt-6 text-[13px] font-semibold tabular-nums tracking-[0.18em] text-ink-3">404</p>
                <h1 className="mt-1 text-[24px] font-bold tracking-tight text-ink-1 break-keep">{t("notFound.title")}</h1>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2 break-keep">{t("notFound.desc")}</p>
                <div className="mt-6 flex gap-2.5">
                    <button type="button" onClick={() => setLocation("/")} className="h-12 flex-1 rounded-2xl bg-brand text-[15px] font-semibold text-white active:opacity-90" data-testid="not-found-home">{t("notFound.home")}</button>
                    {canBack && <button type="button" onClick={() => window.history.back()} className="h-12 flex-1 rounded-2xl bg-white text-[15px] font-semibold text-ink-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:opacity-90" data-testid="not-found-back">{t("notFound.back")}</button>}
                </div>
            </div>
        </div>
    );
}
