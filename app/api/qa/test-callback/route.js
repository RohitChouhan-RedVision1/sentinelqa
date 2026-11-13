import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { Bug, TestResult, TestRun } from "@/lib/models";
import { verifyCallbackSignature } from "@/lib/callback";
import { list, seed, update } from "@/lib/store";

const ResultSchema = z.object({ resultKey: z.string().min(1).max(160), testCaseId: z.string().max(100).optional(), title: z.string().min(1).max(240), category: z.string().max(100).optional(), status: z.enum(["passed", "failed", "blocked", "inconclusive"]), severity: z.enum(["critical", "high", "medium", "low"]).optional(), evidence: z.string().max(8000).optional(), consoleErrors: z.array(z.string().max(2000)).max(100).default([]), failedRequests: z.array(z.string().max(2000)).max(100).default([]), screenshot: z.string().max(500).optional(), browser: z.string().max(100).optional(), durationMs: z.number().nonnegative().max(3600000).optional() });
const BugSchema = z.object({ resultKey: z.string().min(1).max(160).optional(), pageUrl: z.string().url().max(2000).optional(), title: z.string().min(1).max(240), description: z.string().max(8000).optional(), steps: z.string().max(8000).optional(), expected: z.string().max(4000).optional(), actual: z.string().max(4000).optional(), severity: z.enum(["critical", "high", "medium", "low"]), screenshot: z.string().max(500).optional(), browser: z.string().max(100).optional() });
const PayloadSchema = z.object({ runId: z.string().min(1).max(100), githubRunId: z.string().max(100).optional(), status: z.enum(["running", "completed", "failed", "inconclusive", "stopped"]), currentCategory: z.string().max(120).optional(), startedAt: z.string().datetime().optional(), completedAt: z.string().datetime().optional(), durationMs: z.number().nonnegative().max(86400000).optional(), summary: z.object({ total: z.number().int().nonnegative().max(10000), passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(), inconclusive: z.number().int().nonnegative(), completedCount: z.number().int().nonnegative() }), results: z.array(ResultSchema).max(10000).default([]), bugs: z.array(BugSchema).max(1000).default([]) });

export async function POST(request) {
  const rawBody = await request.text();
  if (!verifyCallbackSignature(rawBody, request.headers.get("x-sentinel-signature"), request.headers.get("x-sentinel-timestamp"))) return NextResponse.json({ error: "Invalid callback signature." }, { status: 401 });
  let body;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Callback body must be valid JSON." }, { status: 400 }); }
  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid callback payload.", details: parsed.error.flatten() }, { status: 400 });
  const payload = parsed.data; const digest = crypto.createHash("sha256").update(rawBody).digest("hex");
  try {
    if (process.env.MONGODB_URI) {
      await connectDb(); const existing = await TestRun.findById(payload.runId).lean();
      if (!existing) return NextResponse.json({ error: "Unknown test run." }, { status: 404 });
      if (existing.callbackDigest === digest) return NextResponse.json({ accepted: true, duplicate: true });
      const summary = payload.summary; const patch = { status: payload.status, currentCategory: payload.currentCategory, githubRunId: payload.githubRunId || existing.githubRunId, total: summary.total, passed: summary.passed, failed: summary.failed, blocked: summary.blocked, inconclusive: summary.inconclusive, completedCount: summary.completedCount, progressPct: summary.total ? Math.round(summary.completedCount / summary.total * 100) : 0, durationMs: payload.durationMs, startedAt: payload.startedAt, completedAt: payload.completedAt, callbackDigest: digest };
      await TestRun.findByIdAndUpdate(payload.runId, patch);
      if (payload.results.length) await TestResult.bulkWrite(payload.results.map((result) => ({ updateOne: { filter: { runId: payload.runId, resultKey: result.resultKey }, update: { $set: { ...result, runId: payload.runId } }, upsert: true } })));
      if (payload.bugs.length) await Bug.bulkWrite(payload.bugs.map((bug) => ({ updateOne: { filter: { runId: payload.runId, resultKey: bug.resultKey }, update: { $set: { ...bug, runId: payload.runId, websiteId: existing.websiteId } }, upsert: true } })));
      return NextResponse.json({ accepted: true, duplicate: false });
    }
  } catch (error) { console.error("qa callback write failed", error.message); return NextResponse.json({ error: "Could not persist callback." }, { status: 500 }); }
  const run = seed().runs.find((item) => item._id === payload.runId); if (!run) return NextResponse.json({ error: "Unknown test run." }, { status: 404 });
  if (run.callbackDigest === digest) return NextResponse.json({ accepted: true, duplicate: true });
  const updated = update("runs", payload.runId, { ...payload.summary, status: payload.status, currentCategory: payload.currentCategory, progressPct: payload.summary.total ? Math.round(payload.summary.completedCount / payload.summary.total * 100) : 0, results: payload.results, bugs: payload.bugs, callbackDigest: digest });
  return NextResponse.json({ accepted: Boolean(updated), duplicate: false });
}
