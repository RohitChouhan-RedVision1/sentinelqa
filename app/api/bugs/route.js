import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { Bug } from "@/lib/models";
import { add, seed } from "@/lib/store";

export async function GET() {
  try { if (process.env.MONGODB_URI) { await connectDb(); return NextResponse.json({ bugs: await Bug.find().sort({ createdAt: -1 }).lean() }); } } catch (error) { console.error("bug db read failed", error.message); }
  return NextResponse.json({ bugs: seed().bugs });
}
export async function POST(request) {
  const body = await request.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "A bug title is required." }, { status: 400 });
  try { if (process.env.MONGODB_URI) { await connectDb(); return NextResponse.json({ bug: await Bug.create({ ...body, title: body.title.trim() }) }, { status: 201 }); } } catch (error) { console.error("bug db write failed", error.message); }
  return NextResponse.json({ bug: add("bugs", { ...body, title: body.title.trim(), status: body.status || "open" }) }, { status: 201 });
}
