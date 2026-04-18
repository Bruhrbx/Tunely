#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output, argv: processArgv } = require("node:process");
const { exec } = require("node:child_process");
const localtunnel = require("localtunnel");

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const START_PORT = 3000;
const API_PORT = 4999;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build"]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

let serverState = {
  serverOn: true,
  selectedFile: "index.html",
  publicUrl: "https://example.loca.lt",
  port: 3000,
  subdomain: "tunely-example",
  logs: [],
  maxLogs: 500
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(filePath) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING & STATE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function addLog(text, type = "out") {
  serverState.logs.push({ text, type, time: new Date().toISOString() });
  if (serverState.logs.length > serverState.maxLogs) {
    serverState.logs.shift();
  }
}

function sysLog(text) {
  addLog(text, "sys");
}

function cmdLog(text) {
  addLog(text, "cmd");
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE & DIRECTORY OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function findHtmlFiles(rootDir) {
  const result = [];

  async function walk(currentDir) {
    try {
      const entries = await fsp.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");
          result.push(relativePath);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  await walk(rootDir);
  return result.sort((a, b) => a.localeCompare(b));
}

async function findHtmlFilesForCli(rootDir) {
  const result = [];

  async function walk(currentDir) {
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
        const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");
        result.push(relativePath);
      }
    }
  }

  await walk(rootDir);
  return result.sort((a, b) => a.localeCompare(b));
}

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE MONITORING
// ═══════════════════════════════════════════════════════════════════════════

function getPerformance() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.round(100 * usedMem / totalMem);

  return {
    cpu: Math.max(0, Math.min(100, cpuUsage)),
    ram: {
      usedMB: Math.round(usedMem / 1024 / 1024),
      totalMB: Math.round(totalMem / 1024 / 1024),
      percent: ramPercent
    }
  };
}

function getNetworkInfo() {
  const nets = os.networkInterfaces();
  const interfaces = [];
  
  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    const ipv4 = addrs.find(a => a.family === 'IPv4');
    const ipv6 = addrs.find(a => a.family === 'IPv6');
    
    interfaces.push({
      name,
      ipv4: ipv4 ? ipv4.address : '-',
      ipv6: ipv6 ? ipv6.address : '-',
      mac: ipv4 ? ipv4.mac : '-'
    });
  }
  
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    interfaces: interfaces.slice(0, 8)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

function executeCmd(command) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ lines: ["[Timeout: Command terlalu lama dijalankan]"] });
    }, 10000);

    const proc = exec(command, { cwd: process.cwd(), maxBuffer: 512 * 1024 }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      const lines = [];
      if (stdout) lines.push(...stdout.split("\n").filter(l => l));
      if (stderr) lines.push(...stderr.split("\n").filter(l => l));
      if (error && !stdout && !stderr) {
        lines.push(`[Error] ${error.message}`);
      }
      resolve({ lines });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PORT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function canBindPort(port) {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    testServer.once("error", () => resolve(false));
    testServer.once("listening", () => {
      testServer.close(() => resolve(true));
    });
    testServer.listen(port, "127.0.0.1");
  });
}

async function findFreePort(startPort) {
  let port = startPort;
  while (port < startPort + 100) {
    const available = await canBindPort(port);
    if (available) return port;
    port += 1;
  }
  throw new Error(`Tidak menemukan port kosong dari ${startPort} hingga ${startPort + 99}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI MODE - UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--file") {
      options.file = argv[i + 1];
      i += 1;
    } else if (token === "--name") {
      options.name = argv[i + 1];
      i += 1;
    } else if (token === "--port") {
      const parsedPort = Number(argv[i + 1]);
      options.port = Number.isInteger(parsedPort) ? parsedPort : undefined;
      i += 1;
    } else if (token === "--auto-stop-ms") {
      const parsedAutoStop = Number(argv[i + 1]);
      options.autoStopMs = Number.isInteger(parsedAutoStop) ? parsedAutoStop : undefined;
      i += 1;
    } else if (token === "--no-clear") {
      options.noClear = true;
    } else if (token === "--api") {
      options.apiOnly = true;
    }
  }
  return options;
}

function printBanner(noClear) {
  if (!noClear) {
    console.clear();
  }
  console.log(String.raw`______             _
|_   _|           | |
  | | _   _ _ __  | | ___
  | || | | | '_ \ | |/ _ \
  | || |_| | | | || |  __/
  \_/ \__,_|_| |_||_|\___|
`);
  console.log("+=====================================================+");
  console.log("|       Tanpa ngrok, 100% Gratis & Open Source        |");
  console.log("+=====================================================+\n");
}

function printBox(title) {
  const width = 48;
  const label = `  ${title}  `;
  const inner = label.length >= width ? label.slice(0, width) : label.padEnd(width, " ");
  console.log("+" + "-".repeat(width + 2) + "+");
  console.log(`| ${inner} |`);
  console.log("+" + "-".repeat(width + 2) + "+\n");
}

function normalizeSubdomain(rawInput) {
  const cleanedInput = String(rawInput || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];

  const normalized = cleanedInput
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

  if (normalized.length > 0) {
    return normalized;
  }

  return `tunely-${Date.now().toString(36).slice(-6)}`;
}

function printTable(rows) {
  const col1 = Math.max(...rows.map((r) => r[0].length), 8);
  const col2 = Math.max(...rows.map((r) => r[1].length), 36);
  const lineTop = `+${"-".repeat(col1 + 2)}+${"-".repeat(col2 + 2)}+`;

  console.log(lineTop);
  for (const [label, value] of rows) {
    console.log(`| ${label.padEnd(col1)} | ${value.padEnd(col2)} |`);
    console.log(lineTop.replace(/-/g, "="));
  }
}

function buildStaticServer(rootDir, entryFile) {
  const absoluteRoot = path.resolve(rootDir);
  const defaultHtml = path.resolve(rootDir, entryFile);

  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://localhost");
      let requestedPath = decodeURIComponent(requestUrl.pathname);
      if (requestedPath === "/") {
        requestedPath = `/${entryFile}`;
      }

      const relativeRequestedPath = requestedPath.replace(/^\/+/, "");
      const absoluteRequestedPath = path.resolve(absoluteRoot, relativeRequestedPath);

      if (
        absoluteRequestedPath !== absoluteRoot &&
        !absoluteRequestedPath.startsWith(`${absoluteRoot}${path.sep}`)
      ) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("403 Forbidden");
        return;
      }

      let finalPath = absoluteRequestedPath;
      if (await isDirectory(finalPath)) {
        finalPath = path.join(finalPath, "index.html");
      }

      if (!(await exists(finalPath))) {
        if (await exists(defaultHtml)) {
          finalPath = defaultHtml;
        } else {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("404 Not Found");
          return;
        }
      }

      const data = await fsp.readFile(finalPath);
      res.writeHead(200, { "Content-Type": getMimeType(finalPath) });
      res.end(data);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`500 Internal Server Error\n${error.message}`);
    }
  });
}

function waitForCtrlC({ server, tunnel }) {
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    console.log("\nMenutup tunnel...");

    try {
      if (tunnel && typeof tunnel.close === "function") {
        await tunnel.close();
      }
    } catch {
      // Ignore tunnel close errors.
    }

    await new Promise((resolve) => server.close(resolve));
    console.log("Tunely berhenti. Sampai jumpa.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return shutdown;
}

// ═══════════════════════════════════════════════════════════════════════════
// API MODE - REQUEST HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleApiRequest(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  let pathname = url.pathname;

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // ─── GET /panel.html ──────────────────────────────────────────────────────
    if ((pathname === "/" || pathname === "/panel.html") && req.method === "GET") {
      const panelPath = path.join(path.dirname(__filename), "panel.html");
      if (await exists(panelPath)) {
        const data = await fsp.readFile(panelPath);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(data);
        return;
      }
    }
    // ─── GET /api/status ──────────────────────────────────────────────────────
    if (pathname === "/api/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(serverState));
      return;
    }

    // ─── GET /api/files ───────────────────────────────────────────────────────
    if (pathname === "/api/files" && req.method === "GET") {
      const files = await findHtmlFiles(process.cwd());
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ files }));
      return;
    }

    // ─── GET /api/perf ────────────────────────────────────────────────────────
    if (pathname === "/api/perf" && req.method === "GET") {
      const perf = getPerformance();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(perf));
      return;
    }

    // ─── GET /api/network ─────────────────────────────────────────────────────
    if (pathname === "/api/network" && req.method === "GET") {
      const network = getNetworkInfo();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(network));
      return;
    }

    // ─── GET /api/logs ────────────────────────────────────────────────────────
    if (pathname === "/api/logs" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ logs: serverState.logs }));
      return;
    }

    // ─── POST /api/cmd ────────────────────────────────────────────────────────
    if (pathname === "/api/cmd" && req.method === "POST") {
      let body = "";
      req.on("data", chunk => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const data = JSON.parse(body);
          const cmd = data.cmd || "";
          cmdLog(cmd);
          const result = await executeCmd(cmd);
          result.lines.forEach(line => addLog(line, "out"));
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // ─── POST /api/shutdown ───────────────────────────────────────────────────
    if (pathname === "/api/shutdown" && req.method === "POST") {
      serverState.serverOn = !serverState.serverOn;
      const msg = serverState.serverOn
        ? "Server dinyalakan kembali ✅"
        : "Server dimatikan ❌";
      sysLog(msg);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        serverOn: serverState.serverOn,
        message: msg
      }));
      return;
    }

    // ─── 404 ──────────────────────────────────────────────────────────────────
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Endpoint tidak ditemukan" }));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVER MODES
// ═══════════════════════════════════════════════════════════════════════════

async function startCliMode(options) {
  printBanner(options.noClear);

  console.log("Mencari file HTML...");
  const rootDir = process.cwd();
  const htmlFiles = await findHtmlFilesForCli(rootDir);
  if (htmlFiles.length === 0) {
    console.log("Tidak ada file HTML yang ditemukan di project ini.");
    console.log("Silakan tambahkan file .html lalu jalankan lagi: node tunely.js");
    process.exit(1);
  }

  console.log(`Ditemukan ${htmlFiles.length} file HTML\n`);
  printBox("[*] Pilih File HTML Yang Akan Tunnel");

  let selectedFile;
  let rl;
  const fileOption = options.file
    ? options.file.split(path.sep).join("/").replace(/^\/+/, "")
    : undefined;

  if (fileOption) {
    selectedFile = htmlFiles.find((filePath) => filePath === fileOption);
    if (!selectedFile) {
      console.error(`File dari --file tidak ditemukan: ${options.file}`);
      process.exit(1);
    }
    console.log(`Pilihan file otomatis: ${selectedFile}`);
  } else {
    for (let i = 0; i < htmlFiles.length; i += 1) {
      console.log(` ${i + 1}. ${htmlFiles[i]}`);
    }

    rl = readline.createInterface({ input, output });
    while (!selectedFile) {
      const answer = await rl.question("\nPilih nomor file: ");
      const selectedIndex = Number(answer);
      if (
        Number.isInteger(selectedIndex) &&
        selectedIndex >= 1 &&
        selectedIndex <= htmlFiles.length
      ) {
        selectedFile = htmlFiles[selectedIndex - 1];
      } else {
        console.log("Pilihan tidak valid. Masukkan angka dari daftar.");
      }
    }
  }

  console.log(`\nFile dipilih: ${selectedFile}\n`);
  printBox("[*] Masukkan Custom Domain / Nama");

  let requestedName = options.name;
  if (!requestedName) {
    if (!rl) {
      rl = readline.createInterface({ input, output });
    }
    requestedName = await rl.question("Nama/Domain: ");
  } else {
    console.log(`Nama/Domain otomatis: ${requestedName}`);
  }

  const subdomain = normalizeSubdomain(requestedName);

  console.log(`\nNama tunnel: ${subdomain}\n`);
  printBox("[*] Booting...");

  console.log("Setup server...");
  await sleep(400);
  const startingPort = options.port && options.port > 0 ? options.port : START_PORT;
  const port = await findFreePort(startingPort);
  const server = buildStaticServer(rootDir, selectedFile);
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  console.log("Server setup selesai");

  console.log("Menjalankan tunnel HTTPS...");
  await sleep(400);
  let tunnel;
  let publicUrl;
  let finalSubdomain = subdomain;
  try {
    tunnel = await localtunnel({
      port,
      subdomain,
      host: "https://loca.lt"
    });
    publicUrl = tunnel.url;
  } catch {
    console.log("Subdomain sedang dipakai. Beralih ke subdomain otomatis...");
    tunnel = await localtunnel({
      port,
      host: "https://loca.lt"
    });
    publicUrl = tunnel.url;
    finalSubdomain = publicUrl.replace(/^https:\/\//, "").split(".")[0];
  }
  console.log("Tunnel aktif");

  if (rl) {
    rl.close();
  }

  // Update server state
  serverState.selectedFile = selectedFile;
  serverState.publicUrl = publicUrl;
  serverState.port = port;
  serverState.subdomain = finalSubdomain;

  console.log("\n+======================================================+");
  console.log("|  Website Anda Sudah Online! (HTTPS Aman)            |");
  console.log("+======================================================+\n");

  printTable([
    ["File", selectedFile],
    ["Domain/Nama", finalSubdomain],
    ["Public URL", publicUrl],
    ["Local URL", `http://localhost:${port}`]
  ]);

  console.log("\nServer sedang berjalan... Tekan Ctrl+C untuk keluar");
  console.log("🎯 Panel API dapat diakses di: http://127.0.0.1:4999");
  console.log("   Password: admin123\n");

  // Start API server in background
  const apiServer = http.createServer(handleApiRequest);
  await new Promise((resolve) => apiServer.listen(API_PORT, "127.0.0.1", resolve));
  sysLog("Panel API server dimulai di port 4999");

  const shutdown = waitForCtrlC({ server: apiServer, tunnel });
  // Also shutdown main server
  const originalShutdown = shutdown;
  process.on("SIGINT", async () => {
    await new Promise((resolve) => server.close(resolve));
    await originalShutdown();
  });

  if (options.autoStopMs && options.autoStopMs > 0) {
    console.log(`Mode test aktif: auto-stop dalam ${options.autoStopMs} ms`);
    setTimeout(() => {
      void shutdown();
    }, options.autoStopMs);
  }
}

async function startApiMode() {
  const server = http.createServer(handleApiRequest);

  server.listen(API_PORT, "127.0.0.1", async () => {
    console.log("\n☕ Tunely Panel API Server");
    console.log("==========================\n");
    console.log(`🚀 API server berjalan di http://127.0.0.1:${API_PORT}`);
    console.log(`📂 Working directory: ${process.cwd()}`);

    // Load initial files
    const files = await findHtmlFiles(process.cwd());
    console.log(`📄 HTML files found: ${files.length}`);

    if (files.length > 0) {
      serverState.selectedFile = files[0];
      console.log(`✓ Selected file: ${serverState.selectedFile}`);
    }

    sysLog("Panel API siap!");
    console.log("\n💡 Buka panel.html di browser untuk mengakses kontrol");
    console.log("   Password: admin123\n");
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\nMenutup API server...");
    server.close(() => {
      console.log("API server berhenti ✅");
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    console.log("\n\nMenutup API server...");
    server.close(() => {
      console.log("API server berhenti ✅");
      process.exit(0);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const options = parseArgs(processArgv.slice(2));

  // Determine which mode to run
  if (options.apiOnly) {
    // Run API server only
    await startApiMode();
  } else {
    // Run CLI mode (default)
    try {
      await startCliMode(options);
    } catch (error) {
      console.error("\nGagal menjalankan Tunely:");
      console.error(error.message);
      process.exit(1);
    }
  }
}

// Run main
main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
