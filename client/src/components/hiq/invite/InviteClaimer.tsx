/**
 * 초대 내기(2026-10-16) — 초대 링크로 온 기기(표시가 남아 있다)에서 로그인한 사람이 생기면, 그 표시를 서버에 한 번 낸다.
 * 서버가 새 계정(가입한 지 7일 안)만 받는다 — 이미 회원이었으면 거절되고 표시를 지운다. 네트워크 오류면 표시를 남겨 다음에 다시.
 * 받으면 '환영해요' 팝업(환영 초크) — 가입 직후 뜨는 다른 창(약관 · 주 종목 · 전화번호 잇기)이 다 닫힌 뒤에.
 * 화면 없이 App 에 한 번 둔다.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { caseImage, caseItem, type CaseLocale } from "@shared/cueCase";
import { claimInvite, clearInviteMark, finalRefusal, readInviteMark, INVITE_ME_KEY } from "./inviteApi";

const LOCALES: readonly CaseLocale[] = ["ko", "en", "es", "vi", "tr"];

export function InviteClaimer() {
    const { member } = useAuth();
    const { t, locale } = useT();
    const l: CaseLocale = (LOCALES as readonly string[]).includes(locale) ? (locale as CaseLocale) : "en";
    const [, setLocation] = useLocation();
    const qc = useQueryClient();
    const tried = useRef<string | null>(null);
    const [welcome, setWelcome] = useState<string | null>(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!member?.id) return;
        const mark = readInviteMark();
        if (!mark || tried.current === `${member.id}:${mark.code}`) return;
        tried.current = `${member.id}:${mark.code}`;
        claimInvite(mark.code).then((r) => {
            clearInviteMark();
            void qc.invalidateQueries({ queryKey: INVITE_ME_KEY });
            void qc.invalidateQueries({ queryKey: ["cue-case"] });
            setWelcome(r.inviter);
        }).catch((e) => { if (finalRefusal(e)) clearInviteMark(); });
    }, [member?.id, qc]);

    // 다른 창이 떠 있으면 기다린다(가입 직후의 약관 · 주 종목 · 전화번호 잇기)
    useEffect(() => {
        if (!welcome || show) return;
        const id = window.setInterval(() => { if (!document.querySelector('[role="dialog"], [role="alertdialog"]')) { setShow(true); window.clearInterval(id); } }, 800);
        return () => window.clearInterval(id);
    }, [welcome, show]);

    if (!welcome || !show) return null;
    const gift = caseItem("chalk-welcome")!;
    const close = () => { setWelcome(null); setShow(false); };
    return (
        <div role="dialog" aria-modal="true" aria-label={t("inv.welcomeTitle")} className="fixed inset-0 z-[75] flex items-center justify-center bg-black/65 px-6" onClick={close} data-testid="invite-welcome">
            <div className="w-full max-w-[360px] rounded-[28px] px-5 pb-5 pt-6 text-center" style={{ background: "linear-gradient(180deg, #FF4FA3, #FF2E8A)", border: "3px solid #1A0B14", boxShadow: "0 8px 0 #1A0B14" }} onClick={(e) => e.stopPropagation()}>
                <img src={caseImage(gift)} alt="" width={150} height={150} className="mx-auto h-[150px] w-[150px] -rotate-6 object-contain" draggable={false} />
                <p className="mt-1 text-[26px] font-bold text-white" style={{ textShadow: "0 3px 0 #1A0B14" }}>{t("inv.welcomeTitle")}</p>
                <p className="mt-1.5 text-[14px] font-semibold leading-relaxed text-[#1A0B14] break-keep">{t("inv.welcomeDesc").replace("{name}", welcome)}</p>
                <p className="mt-1 text-[13px] font-bold text-white">{gift.name[l]}</p>
                <div className="mt-4 flex gap-2">
                    <button type="button" onClick={close} className="h-12 flex-1 rounded-full bg-white/85 text-[14px] font-semibold text-[#1A0B14]">{t("inv.later")}</button>
                    <button type="button" onClick={() => { close(); setLocation("/cue-case?sec=chalk"); }} className="h-12 flex-[1.4] rounded-full text-[15px] font-bold" style={{ background: "#FFE14D", color: "#1A0B14", border: "2px solid #1A0B14" }} data-testid="invite-welcome-open">{t("inv.welcomeCta")}</button>
                </div>
            </div>
        </div>
    );
}
