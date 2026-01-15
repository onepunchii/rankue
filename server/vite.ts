import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer, createLogger } = await import("vite");
  // Use explicit .ts extension for local development with tsx
  const viteConfig = (await import("../vite.config.ts")).default;
  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In Vercel environment, __dirname is usually /var/task/server
  // But our build output is in /var/task/dist/public or similar depending on Vercel build config.
  // We need to robustly find the 'dist/public' directory.

  // Try to find the dist folder relative to the current file location
  const possiblePaths = [
    path.resolve(__dirname, "../dist/public"), // Local build
    path.resolve(__dirname, "../../dist/public"), // Nested structure
    path.resolve(process.cwd(), "dist/public"), // Project root
    path.resolve(process.cwd(), "public") // Fallback
  ];

  let distPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      distPath = p;
      break;
    }
  }

  if (!distPath) {
    // On Vercel, static files are handled by 'Handle: filesystem' in vercel.json.
    // So if the directory isn't found, we might rely on Vercel's routing, 
    // BUT we still need to serve index.html for SPA fallback.
    // Let's assume standard Vercel structure if not found.
    console.warn("⚠️ Could not find static build directory. SPA fallback might fail.");
    distPath = path.resolve(process.cwd(), "dist/public");
  }


  app.use(express.static(distPath));

  // prevent API or asset 404s from falling through to SPA index.html
  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api") ||
      req.originalUrl.startsWith("/assets") ||
      req.originalUrl.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|json)$/)) {
      return res.status(404).send("Not Found");
    }
    next();
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
