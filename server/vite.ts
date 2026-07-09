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

export async function setupVite(app: Express, server: Server, port: number) {
  const { createServer: createViteServer, createLogger } = await import("vite");
  // Use explicit .ts extension for local development with tsx
  const viteConfig = (await import("../vite.config.ts")).default;
  const viteLogger = createLogger();

  const serverOptions = {
    middlewareMode: true,
    hmr: { server, clientPort: port },
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
  const rootDir = process.cwd();

  // Vercel deployment structure can vary. We search for dist/public with high priority.
  const possiblePaths = [
    path.join(rootDir, "dist", "public"),           // Standard build output
    path.join(rootDir, "public"),                  // Fallback to source public
    path.join(__dirname, "public"),                 // Relative if bundled in same dir
    path.join(__dirname, "..", "dist", "public"),   // Common node structure
    path.join(__dirname, "..", "..", "dist", "public") // Source structure
  ];

  let distPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      if (fs.existsSync(path.join(p, "index.html"))) {
        distPath = p;
        break;
      }
    }
  }

  if (!distPath) {
    distPath = path.resolve(rootDir, "dist/public");
    console.warn(`[Static] ⚠️ index.html not found in common paths. Defaulting to: ${distPath}`);
  } else {
    console.log(`[Static] ✅ Serving from: ${distPath}`);
  }

  // Handle static assets first
  // Use absolute path for express.static
  app.use(express.static(distPath, {
    index: false,
    maxAge: '1d', // Assets are hashed, so they can be cached
    setHeaders: (res, filePath) => {
      // Never cache index.html
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    }
  }));

  // SPA Fallback: Serve index.html for any non-API/non-asset route
  app.use((req, res, next) => {
    // 1. Skip API calls
    if (req.url.startsWith("/api")) return next();

    // 2. Identify if it's an asset request that express.static MISSED
    // If it's a known asset extension but we're here, it's a genuine 404
    const isAsset = req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|json|webmanifest|woff2?|ttf|otf)$/);
    if (isAsset) {
      console.log(`[Static] ❌ Asset not found: ${req.url}`);
      return res.status(404).send(`Asset ${req.url} was not found on this server.`);
    }

    // 3. For everything else (e.g., /persona, /home), serve the SPA entry point
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.sendFile(indexPath);
    }

    // 4. Final fallback
    res.status(404).send("Application shell (index.html) not found. Build may have failed.");
  });
}
