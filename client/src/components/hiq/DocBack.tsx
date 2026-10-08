import { useT } from "@/lib/i18n";
import { backOrHome, isNativeApp } from "@/lib/nativeBridge";

/**
 * 탭도 헤더도 없는 읽기용 문서 화면의 '뒤로'(2026-10-08 오너: "아이폰은 시스템 뒤로가기 버튼이 없잖아 — 우리 페이지에
 * 뒤로가기 안 되어 있으면 어떻게 돼?").
 *
 * 훑어보니 개인정보처리방침·고객지원·계정 삭제 안내·소개가 그랬다 — 메뉴에서 들어가면 아이폰 앱에서는 나올 길이 없었다
 * (이용약관만 뒤로 단추가 있었다). 흰 문서 화면을 새로 만들면 맨 위에 이것을 둔다.
 *
 * 보이는 때: 돌아갈 곳이 있거나(히스토리), 앱 안이거나. 앱에서는 돌아갈 곳이 없어도 보인다 — 그때는 첫 화면으로 간다.
 * 검색으로 바로 들어온 브라우저 방문(돌아갈 곳이 없다)에는 숨긴다 — 서버가 봇에게 준 문서(prerender)와 화면이 같아야 한다.
 */
export const hasBackTarget = (): boolean =>
    typeof window !== "undefined" && (isNativeApp() || window.history.length > 1);

export function DocBack({ label, className = "" }: { label?: string; className?: string }) {
    const { t } = useT();
    if (!hasBackTarget()) return null;
    return (
        <button
            type="button"
            data-doc-back
            onClick={backOrHome}
            className={`-ml-1 mb-4 inline-flex h-9 items-center px-1 text-sm font-medium text-gray-500 underline-offset-2 hover:underline ${className}`}
        >
            ← {label ?? t("common.back")}
        </button>
    );
}
