const API = "https://api.github.com";

function config() {
  const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GITHUB_WORKFLOW_ID", "GITHUB_REF"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`GitHub Actions is not configured: missing ${missing.join(", ")}.`);
  return { owner: process.env.GITHUB_OWNER, repo: process.env.GITHUB_REPO, workflow: process.env.GITHUB_WORKFLOW_ID, ref: process.env.GITHUB_REF };
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { accept: "application/vnd.github+json", authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "x-github-api-version": "2022-11-28", ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export async function dispatchWebsiteTest({ runId, targetUrl, categories, pageUrls, testCaseIds, callbackUrl }) {
  const { owner, repo, workflow, ref } = config();
  await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref, inputs: { run_id: runId, target_url: targetUrl, categories: JSON.stringify(categories || []), page_urls: JSON.stringify(pageUrls || []), test_case_ids: JSON.stringify(testCaseIds || []), callback_url: callbackUrl } }) });
  return { accepted: true, workflow, ref };
}

export async function findWorkflowRun(runId) {
  const { owner, repo, workflow, ref } = config();
  const data = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=20`);
  return data.workflow_runs?.find((run) => run.name === `Sentinel QA ${runId}`) || null;
}

export async function getWorkflowRun(runNumber) {
  const { owner, repo } = config();
  return githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runNumber)}`);
}

export async function cancelWorkflow(runNumber) {
  const { owner, repo } = config();
  await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runNumber)}/cancel`, { method: "POST" });
  return { cancelled: true };
}

export function callbackUrl(request) { return process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/qa/test-callback` : new URL("/api/qa/test-callback", request.url).toString(); }
