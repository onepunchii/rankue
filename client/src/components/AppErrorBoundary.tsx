/**
 * 앱 맨 바깥 오류 화면(2026-10-01 오너: "버튼을 랜덤으로 누르면 하얗게 변하면서 아무것도 안 나온다").
 *
 * 그전엔 오류 경계가 하나도 없어서, 어느 화면이든 그리다 한 번 터지면 React 가 앱 전체를 내렸다 — 남는 건 body 의
 * 흰 바탕뿐(당구는 밝은 테마라 '하얗게'). 이제 그 자리에 우리 디자인의 안내 카드가 뜨고, '다시 시도'·'처음 화면으로'로
 * 앱을 다시 살린다. 뒤로 가기(안드로이드 뒤로 단추 포함)를 누르면 저절로 다시 그린다.
 *  - 배포 직후 옛 조각 파일 오류면 한 번 새로고침한다(lib/chunkReload) — 대부분은 사용자가 이 카드를 보지도 못한다.
 *  - 잡은 오류는 /api/errors 로 보낸다(React 가 잡은 오류는 window 'error' 로 오지 않아서 따로 보낸다).
 * 언어 공급자(I18nProvider)보다 바깥이라 useT 를 못 쓴다 — 저장된 언어로 다섯 말 중 하나를 고른다.
 * 색은 토큰만(surface·ink·brand) — 골프 화면이면 :root[data-sport="GOLF"] 가 그대로 남아 어두운 카드가 된다.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError, reloadOnce } from "@/lib/chunkReload";
import { reportClientError } from "@/lib/errorReporter";

type Copy = { title: string; body: string; retry: string; home: string; newTitle: string; newBody: string; reload: string };
const COPY: Record<"ko" | "en" | "es" | "tr" | "vi", Copy> = {
    ko: { title: "화면을 그리지 못했어요", body: "잠깐 문제가 생겼어요. 다시 시도하거나 처음 화면으로 돌아가 주세요.", retry: "다시 시도", home: "처음 화면으로", newTitle: "새 버전이 나왔어요", newBody: "새로 고치면 바로 이어서 쓸 수 있어요.", reload: "새로 고침" },
    en: { title: "Something went wrong", body: "Please try again, or go back to the home screen.", retry: "Try again", home: "Go home", newTitle: "A new version is ready", newBody: "Reload to keep going.", reload: "Reload" },
    es: { title: "Algo salió mal", body: "Inténtalo de nuevo o vuelve a la pantalla de inicio.", retry: "Reintentar", home: "Ir al inicio", newTitle: "Hay una nueva versión", newBody: "Recarga para continuar.", reload: "Recargar" },
    tr: { title: "Bir sorun oluştu", body: "Tekrar deneyin veya ana ekrana dönün.", retry: "Tekrar dene", home: "Ana ekran", newTitle: "Yeni sürüm hazır", newBody: "Devam etmek için yenileyin.", reload: "Yenile" },
    vi: { title: "Đã xảy ra lỗi", body: "Vui lòng thử lại hoặc quay về màn hình chính.", retry: "Thử lại", home: "Về trang chính", newTitle: "Đã có phiên bản mới", newBody: "Tải lại để tiếp tục.", reload: "Tải lại" },
};

function copyFor(): Copy {
    let saved: string | null = null;
    try { saved = localStorage.getItem("rankue-locale"); } catch { /* 못 읽으면 기기 언어 */ }
    const lang = (saved || (typeof navigator !== "undefined" ? navigator.language : "ko") || "ko").slice(0, 2).toLowerCase();
    return COPY[lang as keyof typeof COPY] ?? COPY.ko;
}

interface State { error: Error | null }

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // 옛 조각 파일이면 조용히 새로고침 — 막 새로고침한 직후(20초 안)라 참았을 때만 아래 카드가 남는다
        if (isChunkLoadError(error) && reloadOnce()) return;
        reportClientError(`boundary: ${error?.message || String(error)}`, `${error?.stack ?? ""}\n--- component stack ---${info.componentStack ?? ""}`);
    }

    componentDidMount() {
        window.addEventListener("popstate", this.onPop);
    }

    componentWillUnmount() {
        window.removeEventListener("popstate", this.onPop);
    }

    /** 뒤로 가기로 다른 화면이 되면 다시 그려 본다 */
    private onPop = () => {
        if (this.state.error) this.setState({ error: null });
    };

    private retry = () => {
        if (this.state.error && isChunkLoadError(this.state.error)) { window.location.reload(); return; }
        this.setState({ error: null });
    };

    private goHome = () => {
        window.location.assign("/dashboard");
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        const c = copyFor();
        const fresh = isChunkLoadError(error);
        return (
            <div role="alert" className="min-h-[100dvh] bg-surface-0 flex items-center justify-center px-5" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                <div className="w-full max-w-[340px] rounded-[22px] bg-surface-1 border border-surface-line px-5 pt-6 pb-4 text-center">
                    <p className="text-[17px] font-bold text-ink-1 break-keep">{fresh ? c.newTitle : c.title}</p>
                    <p className="mt-2 text-[14.5px] leading-[1.55] text-ink-3 break-keep">{fresh ? c.newBody : c.body}</p>
                    <div className="mt-5 flex gap-2">
                        {!fresh && (
                            <button type="button" onClick={this.goHome} className="flex-1 h-12 rounded-2xl bg-surface-3 text-[15px] font-semibold text-ink-1 active:opacity-80">
                                {c.home}
                            </button>
                        )}
                        <button type="button" onClick={this.retry} className="flex-1 h-12 rounded-2xl bg-brand text-[15px] font-bold text-brand-fg active:opacity-85">
                            {fresh ? c.reload : c.retry}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
