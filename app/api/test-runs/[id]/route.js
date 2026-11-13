import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { TestRun, TestResult } from "@/lib/models";
import { list, seed } from "@/lib/store";
import { findWorkflowRun, getWorkflowRun } from "@/lib/github";

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    if (process.env.MONGODB_URI) {
      await connectDb();
      const run = await TestRun.findById(id).lean();
      if (!run) return NextResponse.json({ error: "Test run not found." }, { status: 404 });
      const results = await TestResult.find({ runId: id }).sort({ createdAt: 1 }).lean();
      if (run.status === "queued" && !run.githubRunId && process.env.GITHUB_TOKEN) {
        const workflow = await findWorkflowRun(id).catch(() => null);
        if (workflow) { await TestRun.findByIdAndUpdate(id, { githubRunId: String(workflow.id), status: workflow.status === "in_progress" ? "running" : "queued", githubConclusion: workflow.conclusion || undefined }); run.githubRunId = String(workflow.id); run.status = workflow.status === "in_progress" ? "running" : "queued"; }
      }
      if (run.githubRunId && ["queued", "running"].includes(run.status) && process.env.GITHUB_TOKEN) {
        const workflow = await getWorkflowRun(run.githubRunId).catch(() => null);
        if (workflow?.status === "in_progress") run.status = "running";
        if (workflow?.status === "completed" && workflow.conclusion && workflow.conclusion !== "success") { run.status = "failed"; run.githubConclusion = workflow.conclusion; await TestRun.findByIdAndUpdate(id, { status: "failed", githubConclusion: workflow.conclusion, error: `GitHub Actions completed with ${workflow.conclusion}.` }); }
      }
      return NextResponse.json({ run, results });
    }
  } catch (error) { console.error("run detail read failed", error.message); }
  const run = seed().runs.find((item) => item._id === id);
  if (!run) return NextResponse.json({ error: "Test run not found." }, { status: 404 });
  return NextResponse.json({ run, results: run.results || [] });
}
