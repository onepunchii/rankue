import { useState } from "react";
import { isNativeApp } from "@/lib/nativeBridge";
import { PushPermissionSheet } from "./PushPermissionSheet";
import { UpdatePromptSheet } from "./UpdatePromptSheet";

// 네이티브 앱에서만 뜨는 안내 두 가지를 한 자리에서 조율한다. 웹 브라우저에선 아무것도 그리지 않는다.
// 업데이트 안내가 떠 있으면 알림 권한 시트는 기다린다 — 아래에서 두 장이 겹쳐 올라오면 둘 다 안 읽힌다.
export function NativePrompts() {
    const [updateOpen, setUpdateOpen] = useState(false);
    if (!isNativeApp()) return null;
    return (
        <>
            <UpdatePromptSheet onOpenChange={setUpdateOpen} />
            <PushPermissionSheet suppressed={updateOpen} />
        </>
    );
}
