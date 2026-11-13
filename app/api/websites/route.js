import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { Website } from "@/lib/models";
import { seed, list } from "@/lib/store";

export async function GET() {
  try { if (process.env.MONGODB_URI) { await connectDb(); return NextResponse.json({ websites: await Website.find().sort({ updatedAt: -1 }).lean() }); } } catch (error) { console.error("website db read failed", error.message); }
  return NextResponse.json({ websites: seed().websites });
}
