import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { TestRun } from "@/lib/models";
import { add, seed, update } from "@/lib/store";
import { callbackUrl, dispatchWebsiteTest } from "@/lib/github";
import { validateTarget } from "@/lib/scanner";

async function createRun(data) {
  if (process.env.MONGODB_URI) { await connectDb(); return TestRun.create(data); }
  return add("runs", data);
}
async function updateRun(id, patch) {
  if (process.env.MONGODB_URI) { await connectDb(); return TestRun.findByIdAndUpdate(id, patch, { new: true }).lean(); }
  return update("runs", id, patch);
}

export async function GET() {
  try { if (process.env.MONGODB_URI) { await connectDb(); return NextResponse.json({ runs: await TestRun.find().sort({ createdAt: -1 }).limit(25).lean() }); } } catch (error) { console.error("run db read failed", error.message); }
  return NextResponse.json({ runs: seed().runs });
}

export async function POST(request) {
  const body = await request.json();
  if (!body.url || body.authorized !== true) return NextResponse.json({ error: "A URL and explicit authorization are required." }, { status: 400 });
  let target;
  try { target = await validateTarget(body.url); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const categories = Array.isArray(body.categories) ? body.categories.filter((item) => typeof item === "string").slice(0, 20) : [];
  const pageUrls = Array.isArray(body.pageUrls) ? body.pageUrls.filter((item) => typeof item === "string").slice(0, 50) : [];
  for (const pageUrl of pageUrls) { try { const parsed = await validateTarget(pageUrl); if (parsed.origin !== target.origin) return NextResponse.json({ error: "Selected pages must stay on the authorized origin." }, { status: 400 }); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); } }
  if (!process.env.QA_CALLBACK_SECRET) return NextResponse.json({ error: "QA_CALLBACK_SECRET must be configured before dispatching a workflow." }, { status: 503 });
  const dispatchKey = crypto.randomUUID();
  const run = await createRun({ websiteId: body.websiteId, targetUrl: target.href, status: "queued", categories, selectedPageIds: Array.isArray(body.selectedPageIds) ? body.selectedPageIds.slice(0, 50) : [], selectedPageUrls: pageUrls, testCaseIds: Array.isArray(body.testCaseIds) ? body.testCaseIds.slice(0, 50) : [], dispatchKey, total: 0, completedCount: 0, progressPct: 0 });
  const runId = String(run._id);
  try {
    const dispatch = await dispatchWebsiteTest({ runId, targetUrl: target.href, categories, pageUrls, testCaseIds: run.testCaseIds, callbackUrl: callbackUrl(request) });
    const updated = await updateRun(runId, { githubWorkflowId: dispatch.workflow, status: "queued" });
    return NextResponse.json({ run: updated || { ...run, githubWorkflowId: dispatch.workflow }, message: "GitHub Actions workflow accepted and awaiting a runner." }, { status: 201 });
  } catch (error) {
    const failed = await updateRun(runId, { status: "failed", error: error.message });
    return NextResponse.json({ error: error.message, run: failed || { ...run, status: "failed", error: error.message } }, { status: 502 });
  }
}
