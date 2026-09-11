import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/nativeBridge";
import { PushPermissionSheet } from "./PushPermissionSheet";
import { UpdatePromptSheet } from "./UpdatePromptSheet";

// 네이티브 앱에서만 뜨는 안내 두 가지를 한 자리에서 조율한다. 웹 브라우저에선 아무것도 그리지 않는다.
// 업데이트 안내가 떠 있으면 알림 권한 시트는 기다린다 — 아래에서 두 장이 겹쳐 올라오면 둘 다 안 읽힌다.
// 업데이트 쪽 결정(iOS 는 스토어 버전을 서버에 묻는다)이 끝날 때까지도 기다린다 — 알림 시트가 먼저 떴다가
// 업데이트 시트로 바뀌지 않게. 결정이 늦어도 5초 뒤엔 알림 시트를 놓아준다.
export function NativePrompts() {
    const [updateOpen, setUpdateOpen] = useState(false);
    const [updateSettled, setUpdateSettled] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setUpdateSettled(true), 5000);
        return () => clearTimeout(t);
    }, []);
    if (!isNativeApp()) return null;
    return (
        <>
            <UpdatePromptSheet onOpenChange={setUpdateOpen} onSettled={() => setUpdateSettled(true)} />
            <PushPermissionSheet suppressed={updateOpen || !updateSettled} />
        </>
    );
}
