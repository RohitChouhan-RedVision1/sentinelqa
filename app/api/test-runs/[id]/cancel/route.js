import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { TestRun } from "@/lib/models";
import { cancelWorkflow } from "@/lib/github";
import { seed, update } from "@/lib/store";

export async function POST(request, { params }) {
  const { id } = await params;
  try {
    if (process.env.MONGODB_URI) {
      await connectDb(); const run = await TestRun.findById(id).lean();
      if (!run) return NextResponse.json({ error: "Test run not found." }, { status: 404 });
      if (run.githubRunId) await cancelWorkflow(run.githubRunId);
      const updated = await TestRun.findByIdAndUpdate(id, { status: "stopped", completedAt: new Date(), error: "Cancelled by workspace administrator." }, { new: true }).lean();
      return NextResponse.json({ run: updated });
    }
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 502 }); }
  const run = seed().runs.find((item) => item._id === id); if (!run) return NextResponse.json({ error: "Test run not found." }, { status: 404 });
  return NextResponse.json({ run: update("runs", id, { status: "stopped", error: "Cancelled by workspace administrator." }) });
}
