import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.env.STATIC_ROOT ?? fileURLToPath(new URL("./dist", import.meta.url)));
const port = Number(process.env.PORT ?? 8080);
const host = "0.0.0.0";

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;

const server = createServer((request, response) => {
  void handle(request, response);
});

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = address && typeof address === "object" ? address.port : port;
  console.log(`Listening on ${actualPort}`);
});

async function handle(request, response) {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" });
      response.end();
      return;
    }

    const pathname = pathnameOf(request.url ?? "/");
    if (pathname === "/health") {
      sendText(response, 200, "ok", request.method);
      return;
    }

    const filePath = safePath(pathname);
    if (!filePath) {
      sendText(response, 400, "Bad request", request.method);
      return;
    }

    const match = await findFile(filePath);
    if (match) {
      sendFile(response, match, pathname, request.method);
      return;
    }

    if (extname(pathname) && extname(pathname) !== ".html") {
      sendText(response, 404, "Not found", request.method);
      return;
    }

    const fallback = resolve(root, "index.html");
    if (await exists(fallback)) {
      sendFile(response, fallback, "/", request.method);
      return;
    }

    sendText(response, 404, "Not found", request.method);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendText(response, 500, "Server error", request.method ?? "GET");
    else response.end();
  }
}

function pathnameOf(url) {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function safePath(pathname) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const full = resolve(root, `.${decoded}`);
  if (full !== root && !full.startsWith(rootPrefix)) return null;
  return full;
}

async function findFile(filePath) {
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      const index = resolve(filePath, "index.html");
      return (await exists(index)) ? index : null;
    }
    return info.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function sendFile(response, filePath, pathname, method) {
  const type = types.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
  const hashed = pathname.startsWith("/assets/");
  response.writeHead(200, {
    "content-type": type,
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
  });
  if (method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
  stream.pipe(response);
}

function sendText(response, status, body, method) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(method === "HEAD" ? undefined : body);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
