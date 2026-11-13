import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { TestCase } from "@/lib/models";
import { add, list, update, seed } from "@/lib/store";

export async function GET() {
  try { if (process.env.MONGODB_URI) { await connectDb(); return NextResponse.json({ testCases: await TestCase.find().sort({ createdAt: -1 }).lean() }); } } catch (error) { console.error("checklist db read failed", error.message); }
  return NextResponse.json({ testCases: seed().testCases });
}
export async function POST(request) {
  const body = await request.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "A test case title is required." }, { status: 400 });
  try { if (process.env.MONGODB_URI) { await connectDb(); const testCase = await TestCase.create({ ...body, title: body.title.trim() }); return NextResponse.json({ testCase }, { status: 201 }); } } catch (error) { console.error("checklist db write failed", error.message); }
  return NextResponse.json({ testCase: add("testCases", { ...body, title: body.title.trim(), status: body.status || "pending", priority: body.priority || "medium" }) }, { status: 201 });
}
export async function PATCH(request) {
  const { id, ...patch } = await request.json();
  if (!id) return NextResponse.json({ error: "Test case id is required." }, { status: 400 });
  try { if (process.env.MONGODB_URI) { await connectDb(); const testCase = await TestCase.findByIdAndUpdate(id, patch, { new: true }).lean(); return NextResponse.json({ testCase }); } } catch (error) { console.error("checklist db patch failed", error.message); }
  return NextResponse.json({ testCase: update("testCases", id, patch) });
}
