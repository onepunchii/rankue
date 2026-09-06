import { defineConfig } from "vitest/config";
import path from "path";

// shared/sim(순수 TS 물리 엔진)과 shared/ 규칙 테스트용. 브라우저 DOM 은 필요 없다.
export default defineConfig({
    test: {
        include: ["shared/**/*.test.ts", "server/**/*.test.ts", "client/src/sim/**/*.test.ts"],
        environment: "node",
    },
    resolve: {
        alias: { "@shared": path.resolve(__dirname, "shared") },
    },
});
