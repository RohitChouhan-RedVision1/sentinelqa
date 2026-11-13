import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const runId = process.env.QA_RUN_ID;
const target = new URL(process.env.QA_TARGET_URL);
const categories = parseJson(process.env.QA_CATEGORIES, ["UI Testing"]);
const pageUrls = parseJson(process.env.QA_PAGE_URLS, [target.href]).slice(0, Number(process.env.QA_MAX_PAGES || 25));
const callbackUrl = process.env.QA_CALLBACK_URL;
const callbackSecret = process.env.QA_CALLBACK_SECRET;
const artifactsDir = "artifacts";
const results = [];
const bugs = [];

function parseJson(value, fallback) { try { const parsed = JSON.parse(value || ""); return Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; } }
function privateIp(ip) { if (net.isIP(ip) === 6) return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:"); const [a, b] = ip.split(".").map(Number); return a === 0 || a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254); }
async function validateUrl(rawUrl, origin = target.origin) { const parsed = new URL(rawUrl); if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin) throw new Error("Target is outside the authorized origin."); if (["localhost", "metadata.google.internal", "metadata.azure.com"].includes(parsed.hostname) || parsed.hostname.endsWith(".localhost")) throw new Error("Private hostname blocked."); const addresses = await dns.lookup(parsed.hostname, { all: true }).catch(() => []); if (addresses.some(({ address }) => privateIp(address))) throw new Error("Private destination blocked."); return parsed; }
function safeName(value) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "page"; }
function nowIso() { return new Date().toISOString(); }
function digest(value) { return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16); }
function summary() { return results.reduce((acc, result) => { acc.total += 1; acc[result.status] = (acc[result.status] || 0) + 1; acc.completedCount += 1; return acc; }, { total: pageUrls.length * categories.length, passed: 0, failed: 0, blocked: 0, inconclusive: 0, completedCount: 0 }); }
async function sendCallback(status, currentCategory = undefined) {
  if (!callbackUrl || !callbackSecret) return;
  const body = JSON.stringify({ runId, status, githubRunId: process.env.GITHUB_RUN_ID, currentCategory, startedAt: process.env.QA_STARTED_AT || nowIso(), completedAt: status === "completed" || status === "failed" ? nowIso() : undefined, durationMs: Number(process.env.QA_DURATION_MS || 0), summary: summary(), results, bugs });
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac("sha256", callbackSecret).update(`${timestamp}.${body}`).digest("hex");
  await fetch(callbackUrl, { method: "POST", headers: { "content-type": "application/json", "x-sentinel-timestamp": timestamp, "x-sentinel-signature": `sha256=${signature}` }, body });
}

function addResult({ resultKey, title, category, status, severity = "medium", evidence, consoleErrors = [], failedRequests = [], browser = "Chromium", screenshot, durationMs }) {
  const result = { resultKey, title, category, status, severity, evidence: String(evidence || "").slice(0, 8000), consoleErrors: consoleErrors.slice(0, 100), failedRequests: failedRequests.slice(0, 100), browser, screenshot, durationMs };
  results.push(result);
  if (status === "failed") bugs.push({ resultKey, pageUrl: resultKey.split("::")[0], title: `${title} failed`, description: result.evidence, steps: `Open ${resultKey.split("::")[0]} and repeat the ${category} check.`, expected: "The documented QA expectation is satisfied.", actual: result.evidence, severity, screenshot, browser });
  return result;
}

async function testPage(url, index) {
  await validateUrl(url);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await context.route("**/*", async (route) => { const requestUrl = route.request().url(); if (requestUrl.startsWith("http")) { try { const parsed = new URL(requestUrl); const addresses = await dns.lookup(parsed.hostname, { all: true }).catch(() => []); if (addresses.some(({ address }) => privateIp(address))) return route.abort(); } catch { return route.abort(); } } return route.continue(); });
  const page = await context.newPage(); const consoleErrors = []; const failedRequests = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || "failed"}`));
  let response; let title = ""; let details = {};
  const started = Date.now();
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Number(process.env.QA_REQUEST_TIMEOUT_MS || 12000) });
    title = await page.title();
    details = await page.evaluate(() => ({ missingAlt: document.querySelectorAll("img:not([alt])").length, brokenImages: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.currentSrc || image.src), hasMetaDescription: Boolean(document.querySelector('meta[name="description"]')), canonical: Boolean(document.querySelector('link[rel="canonical"]')), h1Count: document.querySelectorAll("h1").length, overflow: document.documentElement.scrollWidth > window.innerWidth }));
  } catch (error) {
    categories.forEach((category) => addResult({ resultKey: `${url}::${category}`, title: `Open ${new URL(url).pathname || "/"}`, category, status: "inconclusive", evidence: error.message, consoleErrors, failedRequests, durationMs: Date.now() - started }));
    await context.close(); return;
  }
  const screenshot = `${artifactsDir}/screenshots/${String(index).padStart(3, "0")}-${safeName(new URL(url).pathname)}.png`;
  for (const category of categories) {
    if (["Authentication Testing", "Functional Testing", "API Testing"].includes(category)) { addResult({ resultKey: `${url}::${category}`, title: `${category} requires approved test data`, category, status: "blocked", severity: "medium", evidence: "No non-destructive credentials or test fixtures were supplied. Manual verification is required.", consoleErrors, failedRequests, durationMs: Date.now() - started }); continue; }
    let status = "passed"; let evidence = `HTTP ${response?.status() || 0}; title=${JSON.stringify(title)}.`; let severity = "medium";
    if (category === "UI Testing") { if (!response?.ok() || details.brokenImages.length) { status = "failed"; severity = "high"; evidence = `HTTP ${response?.status() || 0}; broken images: ${details.brokenImages.length}.`; } }
    if (category === "SEO Testing") { const problems = []; if (!title.trim()) problems.push("missing title"); if (!details.hasMetaDescription) problems.push("missing meta description"); if (details.h1Count !== 1) problems.push(`expected one H1, found ${details.h1Count}`); if (problems.length) { status = "failed"; evidence = problems.join("; "); } }
    if (category === "Accessibility Testing") { await page.addScriptTag({ content: axeSource }); const axe = await page.evaluate(async () => window.axe.run()); if (axe.violations.length) { status = "failed"; severity = "high"; evidence = `${axe.violations.length} axe-core violations: ${axe.violations.slice(0, 5).map((item) => item.id).join(", ")}.`; } else evidence = "axe-core reported no violations in the loaded page."; }
    if (category === "Responsive Testing" && details.overflow) { status = "failed"; evidence = "Document width exceeds viewport width at desktop size."; }
    if (category === "Security Testing") { const headers = response?.headers() || {}; const missing = ["x-content-type-options", "content-security-policy"].filter((header) => !headers[header]); if (missing.length) { status = "failed"; evidence = `Missing basic security headers: ${missing.join(", ")}.`; } }
    if (category === "Performance Testing") { const timing = await page.evaluate(() => Math.round(performance.getEntriesByType("navigation")[0]?.duration || 0)); if (timing > 3000) { status = "failed"; evidence = `Navigation duration ${timing}ms exceeded the 3000ms review threshold.`; } else evidence = `Navigation duration ${timing}ms.`; }
    if (status === "failed") { await mkdir(`${artifactsDir}/screenshots`, { recursive: true }); await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {}); }
    addResult({ resultKey: `${url}::${category}`, title: `${category} checks for ${new URL(url).pathname || "/"}`, category, status, severity, evidence, consoleErrors, failedRequests, screenshot: status === "failed" ? screenshot : undefined, durationMs: Date.now() - started });
  }
  await context.close();
}

async function runLighthouse() {
  if (!categories.includes("Performance Testing")) return;
  try {
    const { launch } = await import("chrome-launcher"); const { default: lighthouse } = await import("lighthouse"); const chrome = await launch({ chromeFlags: ["--headless", "--no-sandbox"] }); const report = await lighthouse(target.href, { port: chrome.port, output: "json", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] }); await chrome.kill(); const scores = report?.lhr?.categories || {}; await writeFile(`${artifactsDir}/lighthouse.json`, JSON.stringify(report?.lhr || {}, null, 2)); addResult({ resultKey: `${target.href}::lighthouse`, title: "Lighthouse quality scores", category: "Performance Testing", status: Object.values(scores).some((item) => item.score !== null && item.score < 0.5) ? "failed" : "passed", evidence: Object.entries(scores).map(([key, item]) => `${key}=${item.score === null ? "n/a" : Math.round(item.score * 100)}`).join(", ") });
  } catch (error) { addResult({ resultKey: `${target.href}::lighthouse`, title: "Lighthouse quality scores", category: "Performance Testing", status: "inconclusive", evidence: error.message }); }
}

async function writeReport() { await mkdir(`${artifactsDir}/screenshots`, { recursive: true }); await writeFile(`${artifactsDir}/results.json`, JSON.stringify({ runId, targetUrl: target.href, categories, summary: summary(), results, bugs }, null, 2)); const rows = results.map((result) => `<tr><td>${escapeHtml(result.category)}</td><td>${escapeHtml(result.title)}</td><td>${escapeHtml(result.status)}</td><td>${escapeHtml(result.evidence)}</td></tr>`).join(""); await writeFile(`${artifactsDir}/report.html`, `<!doctype html><html><head><meta charset="utf-8"><title>Sentinel QA ${escapeHtml(runId)}</title><style>body{font-family:system-ui;padding:32px;color:#172033}table{border-collapse:collapse;width:100%}td,th{border:1px solid #dbe3ef;padding:8px;text-align:left}th{background:#f4f7fb}.failed{color:#b42318}</style></head><body><h1>Sentinel QA report</h1><p>${escapeHtml(target.href)} · run ${escapeHtml(runId)}</p><pre>${escapeHtml(JSON.stringify(summary(), null, 2))}</pre><table><thead><tr><th>Category</th><th>Test</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></body></html>`); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

let browser;
try {
  if (!runId || !callbackUrl || !callbackSecret) throw new Error("QA_RUN_ID, QA_CALLBACK_URL, and QA_CALLBACK_SECRET are required.");
  for (const url of pageUrls) await validateUrl(url);
  browser = await chromium.launch({ headless: true });
  await sendCallback("running");
  for (let index = 0; index < pageUrls.length; index += 1) { await testPage(pageUrls[index], index); await sendCallback("running", categories[Math.min(index, categories.length - 1)]); }
  await runLighthouse(); await writeReport(); await sendCallback(results.some((result) => result.status === "inconclusive") ? "inconclusive" : "completed");
} catch (error) {
  await mkdir(artifactsDir, { recursive: true }); await writeFile(`${artifactsDir}/runner-error.txt`, error.stack || error.message); await sendCallback("failed"); process.exitCode = 1;
} finally { if (browser) await browser.close().catch(() => {}); }
