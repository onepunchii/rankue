import { useT } from "@/lib/i18n";
import { isNativeApp } from "@/lib/nativeBridge";
import { playLink, appStoreLink } from "@shared/appLinks";

// 공개 페이지 공통 푸터 — 사이트 어디서나 앱 스토어로 가는 **실제로 보이는 링크**를 둔다.
//
// 왜 필요한가: Play·App Store 페이지는 구글 웹 검색에 색인되는 웹페이지다. 이미 색인이
// 잡힌 우리 페이지들에서 그 스토어 페이지로 링크를 걸면 스토어 페이지의 검색 노출에
// 도움이 된다. 그런데 기존 패밀리 서비스 카드는 **클라이언트에서 기기 감지로 URL 을
// 갈아 끼우기 때문에 서버 HTML 에 스토어 링크가 없었다** — 사람에게는 작동하고
// 크롤러에는 안 보이는 상태였다. 이 푸터가 그 구멍을 메운다.
//   · 크롤러가 보는 쪽: server/prerender.ts 의 siteFooter() 가 **같은 내용**을 HTML 로 낸다.
//   · 사용자가 보는 쪽: 이 컴포넌트. 두 쪽이 같아야 클로킹이 아니다.
//
// ⛔ 숨김 링크(display:none·sr-only·0px·화면 밖)로 처리하지 않는다 — 클로킹으로 취급돼
//    역효과다. 여기 링크는 전부 눈에 보이고 눌러진다.
//
// ★ 네이티브 앱(Capacitor) 안에서는 스토어 버튼 줄만 감춘다:
//   이미 앱을 쓰는 사람에게 "앱 받으세요"는 무의미하고, 애플 심사 지침이 앱 안에서
//   다른 모바일 플랫폼(구글 플레이) 언급을 막는다. 웹 방문자·크롤러는 전원 그대로 본다
//   (marketing-landing.tsx 의 다운로드 섹션이 쓰는 것과 같은 기준이다).

export function SiteFooter() {
  const { t } = useT();
  const inApp = isNativeApp();
  const play = playLink("footer");
  const ios = appStoreLink("footer");

  return (
    <footer className="mt-14 border-t border-black/[0.07] pt-8 pb-10">
      {/* 스토어 링크 — 웹에서만. 스토어에 없는 플랫폼은 버튼 자체를 그리지 않는다. */}
      {!inApp && (play || ios) && (
        <div className="mb-7">
          <p className="text-center text-[13px] font-semibold text-ink-3">{t("footer.getApp")}</p>
          <div className="mx-auto mt-3 flex max-w-sm flex-col gap-2 sm:flex-row">
            {play && (
              <a
                href={play}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 shrink-0 items-center justify-center rounded-2xl bg-[#1c1c1f] text-[14px] font-bold text-white transition-transform active:scale-[0.98] sm:flex-1"
              >
                Google Play
              </a>
            )}
            {ios && (
              <a
                href={ios}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 shrink-0 items-center justify-center rounded-2xl bg-black/[0.06] text-[14px] font-bold text-ink-1 transition-transform active:scale-[0.98] sm:flex-1"
              >
                App Store
              </a>
            )}
          </div>
        </div>
      )}

      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium text-ink-4">
        <a href="/about" className="hover:text-ink-2">{t("footer.about")}</a>
        <span aria-hidden>·</span>
        <a href="/app" className="hover:text-ink-2">{t("footer.appPage")}</a>
        <span aria-hidden>·</span>
        <a href="/stores" className="hover:text-ink-2">{t("footer.stores")}</a>
        <span aria-hidden>·</span>
        <a href="/support" className="hover:text-ink-2">{t("footer.support")}</a>
        <span aria-hidden>·</span>
        <a href="/privacy" className="hover:text-ink-2">{t("footer.privacy")}</a>
      </nav>

      <p className="mt-4 text-center text-[12px] font-medium text-ink-4">
        RANKUE · {t("footer.company")}
      </p>
    </footer>
  );
}
