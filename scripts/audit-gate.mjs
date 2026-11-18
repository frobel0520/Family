// 依賴稽核關卡：high/critical 一律擋下，只有 security/audit-exceptions.json 內「未到期」的 advisory 可暫時放行。
// 用法：node scripts/audit-gate.mjs [npm|pnpm]（在套件目錄執行；預設 npm）
// 例外到期後自動恢復擋下；audit 輸出無法解析時視為失敗，不當作通過。
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const BLOCKING = new Set(["high", "critical"]);
const run = promisify(execFile);

/** @param {string} file @param {Date} now */
export function loadActiveExceptions(file, now) {
  const list = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(list)) throw new Error(`${file} 必須是陣列`);
  const active = new Map();
  for (const item of list) {
    if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(item?.id ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(item?.expires ?? "") || !item.reason) {
      throw new Error(`例外格式錯誤：${JSON.stringify(item)}`);
    }
    const expiry = new Date(`${item.expires}T23:59:59Z`);
    if (expiry < now) console.warn(`例外已到期，不再放行：${item.id}（${item.expires}）`);
    else active.set(item.id, item);
  }
  return active;
}

/** @param {unknown} url */
const ghsaOf = (url) => /GHSA-[a-z0-9-]+/i.exec(String(url ?? ""))?.[0] ?? null;

/** @typedef {{ package: string, severity: string, advisories: string[] }} Finding */

/** npm audit --json（auditReportVersion 2）→ 每個 high/critical 套件追到根源 advisory。
 * @param {any} report @returns {Finding[]} */
function npmFindings(report) {
  if (report?.auditReportVersion !== 2 || typeof report.vulnerabilities !== "object") throw new Error("npm audit 輸出格式無效");
  const vulns = report.vulnerabilities;
  /** @param {string} name @param {Set<string>} [seen] @returns {string[]} */
  const roots = (name, seen = new Set()) => {
    if (seen.has(name) || !vulns[name]) return [];
    seen.add(name);
    // 只看 high/critical 的根源；medium 以下與原本 --audit-level=high 一樣不擋
    return vulns[name].via.flatMap((/** @type {any} */ v) => (typeof v === "string" ? roots(v, seen) : BLOCKING.has(v.severity) ? [ghsaOf(v.url) ?? `unknown:${v.source}`] : []));
  };
  return Object.entries(vulns)
    .filter(([, /** @type {any} */ v]) => BLOCKING.has(v.severity))
    .map(([name, /** @type {any} */ v]) => ({ package: name, severity: v.severity, advisories: [...new Set(roots(name))] }));
}

/** pnpm audit --json → advisories 物件。
 * @param {any} report @returns {Finding[]} */
function pnpmFindings(report) {
  if (!report || typeof report.advisories !== "object" || !report.metadata) throw new Error("pnpm audit 輸出格式無效");
  return Object.values(report.advisories)
    .filter((/** @type {any} */ a) => BLOCKING.has(a.severity))
    .map((/** @type {any} */ a) => ({ package: a.module_name, severity: a.severity, advisories: [a.github_advisory_id ?? ghsaOf(a.url) ?? `unknown:${a.id}`] }));
}

/** 純函式：回傳被擋下與被例外放行的項目。
 * @param {unknown} report @param {string} tool @param {Map<string, unknown>} active */
export function evaluate(report, tool, active) {
  const findings = tool === "pnpm" ? pnpmFindings(report) : npmFindings(report);
  // 追不到任何 high/critical 根源時保守擋下，避免把格式異常當成通過
  const blocked = findings.filter((f) => f.advisories.length === 0 || f.advisories.some((id) => !active.has(id)));
  const excused = findings.filter((f) => !blocked.includes(f));
  return { blocked, excused };
}

async function main() {
  const tool = process.argv[2] ?? "npm";
  if (!["npm", "pnpm"].includes(tool)) throw new Error(`不支援的工具：${tool}`);
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const active = loadActiveExceptions(resolve(repoRoot, "security/audit-exceptions.json"), new Date());
  const bin = process.platform === "win32" ? `${tool}.cmd` : tool;
  let stdout = "";
  try {
    ({ stdout } = await run(bin, ["audit", "--json"], { maxBuffer: 16 * 1024 * 1024, shell: process.platform === "win32" }));
  } catch (/** @type {any} */ error) {
    stdout = error.stdout ?? "";
    if (!stdout) throw error;
  }
  const { blocked, excused } = evaluate(JSON.parse(stdout), tool, active);
  for (const f of excused) console.log(`例外放行 ${f.severity} ${f.package}：${f.advisories.map((id) => `${id}（到 ${/** @type {any} */ (active.get(id)).expires}）`).join("、")}`);
  for (const f of blocked) console.error(`擋下 ${f.severity} ${f.package}：${f.advisories.join("、") || "無法追到 advisory"}`);
  console.log(`依賴稽核：high/critical 擋下 ${blocked.length}、例外放行 ${excused.length}`);
  process.exitCode = blocked.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((/** @type {any} */ error) => {
    console.error(`依賴稽核未完成：${error.message}`);
    process.exitCode = 2;
  });
}
