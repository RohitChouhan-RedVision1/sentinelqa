import dns from "node:dns/promises";
import net from "node:net";
import { load } from "cheerio";

const MAX_PAGES = Number(process.env.QA_MAX_PAGES || 25);
const MAX_DEPTH = Number(process.env.QA_CRAWL_DEPTH || 3);
const TIMEOUT = Number(process.env.QA_REQUEST_TIMEOUT_MS || 12000);
const MAX_REDIRECTS = 5;
const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "metadata.google.internal", "169.254.169.254", "metadata.azure.com"]);

function isPrivateIp(ip) {
  if (net.isIP(ip) === 6) return ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
}

export async function validateTarget(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error("Enter a complete website URL, including https://."); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http and https URLs are supported.");
  if (parsed.username || parsed.password) throw new Error("URLs containing credentials are not accepted.");
  if (BLOCKED_HOSTS.has(parsed.hostname.toLowerCase()) || parsed.hostname.endsWith(".localhost")) throw new Error("Localhost and cloud metadata targets are blocked.");
  if (process.env.QA_ALLOW_PRIVATE_TARGETS !== "true") {
    const addresses = await dns.lookup(parsed.hostname, { all: true }).catch(() => []);
    if (addresses.some(({ address }) => isPrivateIp(address))) throw new Error("Private and internal network targets are blocked.");
  }
  return parsed;
}

function absoluteUrl(value, base) { try { return new URL(value, base); } catch { return null; } }
function strip(value) { return value.replace(/\s+/g, " ").trim(); }
function sameOrigin(value, origin) { return value?.origin === origin && /^https?:$/.test(value.protocol); }

export async function fetchPage(url, expectedOrigin) {
  let current = await validateTarget(url);
  const origin = expectedOrigin || current.origin;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (current.origin !== origin) throw new Error("Redirect left the authorized origin.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await fetch(current.href, { signal: controller.signal, redirect: "manual", headers: { "user-agent": "SentinelQA/1.0 authorized-audit" } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        const next = location && absoluteUrl(location, current);
        if (!next || !sameOrigin(next, origin)) throw new Error("Redirect target is outside the authorized origin.");
        current = await validateTarget(next.href);
        continue;
      }
      return { response, html: await response.text(), finalUrl: current.href };
    } finally { clearTimeout(timer); }
  }
  throw new Error("Too many redirects.");
}

async function readRobots(origin) {
  try {
    const { response, html } = await fetchPage(`${origin}/robots.txt`, origin);
    return { url: `${origin}/robots.txt`, statusCode: response.status, text: html.slice(0, 20000), disallow: html.split(/\r?\n/).filter((line) => /^\s*disallow:/i.test(line)).map((line) => line.split(":").slice(1).join(":").trim()).filter(Boolean) };
  } catch { return { url: `${origin}/robots.txt`, statusCode: 0, text: "", disallow: [] }; }
}

export async function scanWebsite(rawUrl) {
  const start = Date.now();
  const root = await validateTarget(rawUrl);
  const origin = root.origin;
  const robots = await readRobots(origin);
  const queue = [{ url: root.href, depth: 0 }]; const visited = new Set(); const pages = [];
  try {
    const sitemap = await fetchPage(`${origin}/sitemap.xml`, origin);
    if (sitemap.response.ok) {
      const xml = load(sitemap.html, { xmlMode: true });
      xml("loc").toArray().map((element) => absoluteUrl(xml(element).text().trim(), root)).filter((item) => sameOrigin(item, origin)).forEach((item) => queue.push({ url: item.href, depth: 1 }));
    }
  } catch { /* A missing sitemap is a valid discovery outcome. */ }
  while (queue.length && pages.length < MAX_PAGES) {
    const current = queue.shift(); const next = current.url; if (visited.has(next)) continue; visited.add(next);
    try {
      const { response, html, finalUrl } = await fetchPage(next, origin);
      if (!response.ok && response.status >= 500) continue;
      const $ = load(html); const pageUrl = new URL(finalUrl); const links = $("a[href]").map((_, element) => absoluteUrl($(element).attr("href"), pageUrl)).get().filter((item) => sameOrigin(item, origin));
      links.forEach((link) => { link.hash = ""; if (current.depth < MAX_DEPTH && !visited.has(link.href) && queue.length < MAX_PAGES * 2) queue.push({ url: link.href, depth: current.depth + 1 }); });
      const path = pageUrl.pathname || "/"; const disallowed = robots.disallow.some((rule) => rule === "/" || (rule && path.startsWith(rule)));
      pages.push({ url: finalUrl, path, title: strip($("title").first().text()) || "Untitled page", statusCode: response.status, links: links.length, forms: $("form").length, buttons: $("button").length, inputs: $("input, select, textarea").length, category: path === "/" ? "Homepage Testing" : "UI Testing", hasMetaDescription: $("meta[name='description']").length > 0, missingAlt: $("img:not([alt])").length, robotsAllowed: !disallowed, internalLinks: links.map((link) => link.href) });
    } catch (error) { pages.push({ url: next, path: new URL(next).pathname || "/", title: "Could not load page", statusCode: 0, error: error.name === "AbortError" ? "Request timed out" : error.message, links: 0, forms: 0, buttons: 0, inputs: 0, category: "UI Testing" }); }
  }
  return { url: root.href, host: root.host, pages, robots, durationMs: Date.now() - start, limits: { maxPages: MAX_PAGES, maxDepth: MAX_DEPTH, timeoutMs: TIMEOUT, maxRedirects: MAX_REDIRECTS }, authorization: "Caller must confirm they own or are authorized to test this domain." };
}
