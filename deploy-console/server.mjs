import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat, copyFile, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(process.env.DEPLOY_PROJECT_ROOT || join(here, ".."));
const dataDir = join(here, "data");
const historyFile = join(dataDir, "deployments.json");
const port = Number(process.env.PORT || 4174);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

async function command(file, args, options = {}) {
  try {
    const { stdout, stderr } = await exec(file, args, { cwd: projectRoot, timeout: 120000, maxBuffer: 1024 * 1024, ...options });
    return { ok: true, output: (stdout || stderr).trim() };
  } catch (error) {
    return { ok: false, output: (error.stderr || error.stdout || error.message || "Command failed").trim() };
  }
}

async function getHistory() {
  try { return JSON.parse(await readFile(historyFile, "utf8")); } catch { return []; }
}
async function saveHistory(history) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(historyFile, JSON.stringify(history.slice(0, 30), null, 2) + "\n");
}
function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body));
}
async function bodyOf(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}
async function statusPayload() {
  const [remote, branch, commit, user, domain] = await Promise.all([
    command("git", ["remote", "get-url", "origin"]),
    command("git", ["branch", "--show-current"]),
    command("git", ["rev-parse", "--short", "HEAD"]),
    command("vercel", ["whoami"]),
    command("vercel", ["domains", "inspect", "ram-upgrade.vercel.app"]),
  ]);
  return {
    repository: remote.ok ? remote.output : "Not connected",
    branch: branch.ok ? branch.output : "Detached",
    commit: commit.ok ? commit.output : "—",
    connections: [
      { name: "GitHub", detail: remote.ok ? "Repository access ready" : "Not connected", state: remote.ok ? "ready" : "needs setup" },
      { name: "Vercel", detail: user.ok ? `Signed in as ${user.output}` : "Sign in locally with Vercel CLI", state: user.ok ? "ready" : "needs setup" },
      { name: "Private server", detail: "Add an SSH target before enabling", state: "needs setup" },
    ],
    production: domain.ok ? "ram-upgrade.vercel.app" : "ram-upgrade.vercel.app",
  };
}
async function deploymentPreview(ref) {
  if (!/^[a-zA-Z0-9._/@-]{1,180}$/.test(ref)) return { ok: false, output: "Invalid branch or commit reference." };
  await command("git", ["fetch", "origin", ref]);
  return command("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/api/status" && req.method === "GET") return send(res, 200, await statusPayload());
    if (url.pathname === "/api/history" && req.method === "GET") return send(res, 200, await getHistory());
    if (url.pathname === "/api/validate" && req.method === "POST") {
      const { ref = "main" } = await bodyOf(req);
      const verified = await deploymentPreview(ref);
      return send(res, verified.ok ? 200 : 400, verified.ok ? { ok: true, commit: verified.output } : { ok: false, error: verified.output });
    }
    if (url.pathname === "/api/deploy" && req.method === "POST") {
      const { ref = "main", target = "vercel" } = await bodyOf(req);
      if (target !== "vercel") return send(res, 400, { ok: false, error: "Private-server publishing is disabled until an SSH target is added." });
      const verified = await deploymentPreview(ref);
      if (!verified.ok) return send(res, 400, { ok: false, error: verified.output });
      const worktree = await mkdtemp(join(tmpdir(), "control-room-"));
      let result;
      try {
        const checkout = await command("git", ["worktree", "add", "--detach", worktree, verified.output]);
        if (!checkout.ok) return send(res, 500, { ok: false, error: checkout.output });
        const linkedProject = join(projectRoot, ".vercel", "project.json");
        if (!existsSync(linkedProject)) return send(res, 400, { ok: false, error: "Vercel is not linked locally. Run `vercel link` once, then retry." });
        await mkdir(join(worktree, ".vercel"), { recursive: true });
        await copyFile(linkedProject, join(worktree, ".vercel", "project.json"));
        result = await command("vercel", ["--prod", "--yes"], { cwd: worktree });
      } finally {
        await command("git", ["worktree", "remove", "--force", worktree]);
      }
      const urlMatch = result.output.match(/https:\/\/[^\s]+\.vercel\.app/);
      const entry = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ref, commit: verified.output, target: "Vercel production", url: urlMatch?.[0] || "https://ram-upgrade.vercel.app", status: result.ok ? "ready" : "failed", log: result.output };
      await saveHistory([entry, ...(await getHistory())]);
      return send(res, result.ok ? 200 : 500, { ok: result.ok, deployment: entry, error: result.ok ? undefined : result.output });
    }
    if (url.pathname === "/api/rollback" && req.method === "POST") {
      const { id } = await bodyOf(req);
      const entry = (await getHistory()).find((item) => item.id === id);
      if (!entry || entry.status !== "ready") return send(res, 404, { ok: false, error: "A deployable history entry was not found." });
      const result = await command("vercel", ["rollback", entry.url, "--yes"]);
      return send(res, result.ok ? 200 : 500, { ok: result.ok, message: result.ok ? `Rolled back to ${entry.commit}` : result.output });
    }
    const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = normalize(join(here, "public", requestPath));
    if (!file.startsWith(join(here, "public")) || !existsSync(file) || !(await stat(file)).isFile()) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    send(res, 200, await readFile(file), types[extname(file)] || "application/octet-stream");
  } catch (error) { send(res, 500, { ok: false, error: error.message || "Unexpected local error" }); }
});

server.listen(port, "127.0.0.1", () => console.log(`Deploy Console ready at http://127.0.0.1:${port}`));
