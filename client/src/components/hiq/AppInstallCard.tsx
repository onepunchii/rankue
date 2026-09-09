import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { isNativeApp } from "@/lib/nativeBridge";
import { detectPlatform, iosStoreUrl, androidStoreUrl } from "@shared/appLinks";

/**
 * 각 페이지 맨 아래에 놓는 앱 설치 카드(2026-09-09 오너: "각 페이지 하단에 우리 og 이미지로 세련되게").
 *
 * 떠 있는 HiqInstallBanner 와 역할이 다르다 — 그쪽은 화면에 붙어 따라다니고, 이건 본문이 끝나는 자리에
 * 한 번 놓인다. 두 개가 같은 화면에 겹치면 설치 권유가 두 번이라 App.tsx 가 이 카드가 있는 페이지에서
 * 떠 있는 배너를 끈다(PAGE_BANNER_ROUTES).
 *
 * 안 보이는 경우:
 *  - 네이티브 앱 안(Capacitor) — 이미 앱을 쓰는 사람에게 "앱을 받으세요"가 뜨는 사고를 막는다.
 *  - 홈 화면에 추가된 PWA(standalone) — 사실상 설치한 상태다.
 *  - PC — 데스크톱에서 모바일 스토어를 열면 막다른 길이다. 데스크톱은 DesktopFrame 옆 패널이 맡는다.
 *
 * 그림은 og.png 에서 공 세 개만 잘라 낸 webp 다(5 KB). 원본은 913 KB 라 모든 페이지에 올릴 수 없다.
 * 카드 배경색은 그 그림 왼쪽 끝 펠트 색과 같아서(#07361d 실측) 이미지가 카드에 그대로 이어진다.
 */
const FELT = "#073520";

type Store = "ios" | "android";

export function AppInstallCard({ className }: { className?: string }) {
    const { t } = useT();
    const [store, setStore] = useState<Store | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isNativeApp()) return;
        const standalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
        if (standalone) return;
        const p = detectPlatform();
        if (p === "ios" || p === "android") setStore(p);
    }, []);

    if (!store) return null;
    const href = store === "ios" ? iosStoreUrl("page_banner") : androidStoreUrl("page_banner");

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                "relative block overflow-hidden rounded-card min-h-[112px] active:scale-[0.99] transition-transform",
                className,
            )}
            style={{ backgroundColor: FELT }}
        >
            {/* 그림은 오른쪽 끝에 붙이고, 왼쪽으로 갈수록 카드 색으로 사라지게 덮는다(글씨 가독성) */}
            <img
                src="/app-banner.webp"
                alt=""
                aria-hidden="true"
                width={300}
                height={230}
                loading="lazy"
                decoding="async"
                className="absolute right-0 top-0 h-full w-[62%] object-cover"
            />
            <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(to right, ${FELT} 38%, ${FELT}00 78%)` }}
            />
            <div className="relative flex flex-col items-start gap-2 py-4 pl-4 pr-[44%]">
                <span className="text-[15px] font-bold text-white leading-snug">{t("appCard.title")}</span>
                <span className="text-[12.5px] font-medium text-white/70 leading-snug text-balance">{t("appCard.desc")}</span>
                <span className="mt-0.5 inline-flex h-9 items-center rounded-pill bg-brand px-4 text-[13px] font-bold text-brand-fg">
                    {t(store === "ios" ? "appCard.ctaIos" : "appCard.ctaAndroid")}
                </span>
            </div>
        </a>
    );
}

export default AppInstallCard;
