# HiQ 서비스 분리 및 독립 프로젝트 마이그레이션 가이드

이 문서는 `polli` 프로젝트에서 **HiQ 당구장 서비스**를 별도의 독립적인 프로젝트로 분리하기 위한 단계별 수행 지침서입니다.
가장 안전하고 쉬운 "Clone & Prune (복제 후 정리)" 방식을 사용합니다.

---

## 📅 1단계: 프로젝트 복제 (터미널 작업 필요 없음)

1. **파일 탐색기(Finder)**를 엽니다.
2. `/Users/choejeonghwan/Desktop/Antigravity/` 폴더로 이동합니다.
3. 현재의 **`polli`** 폴더를 선택하고 `복사(Cmd+C)` 후 `붙여넣기(Cmd+V)` 합니다.
4. 생겨난 폴더(`polli 복사본` 등)의 이름을 **`hiq-billiards`** (또는 원하시는 이름)로 변경합니다.
   > 💡 **Tip:** 이제 원본 `polli`는 안전합니다. 새로 만든 `hiq-billiards` 폴더를 VS Code에서 엽니다.

---

## 🧹 2단계: 클라이언트(Client) 대청소

새 프로젝트(`hiq-billiards`)에서 작업합니다.

### 2-1. App.tsx 정리 (메인 진입점 변경)

`client/src/App.tsx` 파일을 열고 다음과 같이 대폭 수정합니다.

1. **불필요한 import 삭제**: 상단의 수많은 페이지 import들을 지우고 HiQ 관련 페이지만 남깁니다.
2. **라우터(Router) 수정**: `/hiq`로 시작하던 경로를 메인 경로(`/`)로 조정합니다.

**수정 예시 (복사해서 덮어쓰세요):**

```tsx
import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";

// HiQ Pages
import HiqLanding from "@/pages/hiq/landing";
import HiqRegister from "@/pages/hiq/register";
import HiqDashboard from "@/pages/hiq/dashboard";
import HiqAdmin from "@/pages/hiq/admin";
import HiqScoreboard from "@/pages/hiq/game/[id]";
import HiqGameResult from "@/pages/hiq/game/result";
import HiqHistory from "@/pages/hiq/history";

function Router() {
  return (
    <Switch>
      {/* 메인 랜딩 페이지 */}
      <Route path="/" component={HiqLanding} />
      
      {/* HiQ 기능 페이지들 */}
      <Route path="/register" component={HiqRegister} />
      <Route path="/dashboard" component={HiqDashboard} />
      <Route path="/game/result" component={HiqGameResult} />
      <Route path="/game/:id" component={HiqScoreboard} />
      <Route path="/history" component={HiqHistory} />
      <Route path="/admin" component={HiqAdmin} />
      
      {/* 기존 /hiq 링크로 접속해도 작동하도록 호환성 유지 (선택사항) */}
      <Route path="/hiq" component={HiqLanding} />
      <Route path="/hiq/dashboard" component={HiqDashboard} />

      {/* 404 페이지 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
```

### 2-2. 불필요한 페이지 폴더 삭제

`client/src/pages` 폴더에서 **`hiq` 폴더와 `not-found.tsx`를 제외하고 모두 삭제**해도 됩니다.

* 삭제 대상: `home.tsx`, `profile`, `politics`, `surveys`, `admin` 등등...
* **남길 것**: `hiq/`, `not-found.tsx`

---

## 🛠 3단계: 서버(Server) 대청소

### 3-1. routes.ts 정리

`server/routes.ts` 파일을 열고 다른 라우터 연결을 끊고 HiQ 라우터만 남깁니다.

**수정 예시:**

```typescript
import type { Express } from "express";
import { createServer, type Server } from "http";
import hiqRouter from "./routes/hiq.js";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("=== HiQ Billiards API Starting ===");

  // HiQ Router 연결
  // (프론트 변경에 맞춰 경로를 /api/hiq -> /api 로 줄일 수도 있지만, 
  //  일단 기존 코드 호환성을 위해 /api/hiq 유지를 추천합니다)
  app.use("/api/hiq", hiqRouter);

  const httpServer = createServer(app);
  return httpServer;
}
```

### 3-2. 불필요한 스토리지/라우트 파일 삭제 (선택사항)

* `server/routes/` 폴더에서 `hiq.ts` 외의 파일들 삭제
* `server/storage/` 폴더에서 `hiqStorage.ts`, `index.ts`, `storage_interface.ts` 외의 파일들 삭제 후 `index.ts`에서 import 정리
  * *주의: 이 단계가 귀찮으면 파일들은 그냥 둬도 됩니다. `routes.ts`에서 연결만 끊으면 실행되지 않습니다.*

---

## ✅ 4단계: 랜딩 페이지 및 리다이렉트 수정

### 4-1. 랜딩 페이지 (client/src/pages/hiq/landing.tsx)

로그인 성공 후 이동할 경로를 수정해야 합니다.
`client/src/App.tsx`에서 라우트를 `/dashboard`로 줄였으므로, 코드 내의 리다이렉트 주소도 맞춰줍니다.

* `landing.tsx`, `register.tsx` 검색: `redirectTo: '/hiq/dashboard'` -> `redirectTo: '/dashboard'`
* 또는 서버 `server/routes/hiq.ts`에서 리턴하는 `redirectTo` 값을 수정

---

## 🚀 5단계: 실행 및 확인

1. 터미널을 열고 새 프로젝트 폴더에서:

   ```bash
   npm run dev
   ```

2. 웹브라우저 주소창에 `localhost:5000` 접속
3. **HiQ 당구장 화면**이 바로 뜨는지 확인!

---

### 💡 팁

이 가이드는 `hiq-billiards` 프로젝트 폴더 안에 넣어두고 체크리스트로 사용하세요.
작업 중 막히는 부분이 있으면 언제든 다시 물어봐 주세요!
