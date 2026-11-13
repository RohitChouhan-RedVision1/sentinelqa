import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { Bug, DiscoveredPage, TestCase, TestRun, Website } from "@/lib/models";
import { list, seed, update } from "@/lib/store";

export async function GET(request, { params }) {
  const { id } = await params;
  try { if (process.env.MONGODB_URI) { await connectDb(); const website = await Website.findById(id).lean(); if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 }); return NextResponse.json({ website, pages: await DiscoveredPage.find({ websiteId: id }).sort({ path: 1 }).lean(), runs: await TestRun.find({ websiteId: id }).sort({ createdAt: -1 }).limit(25).lean() }); } } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const website = seed().websites.find((item) => item._id === id); if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  return NextResponse.json({ website, pages: list("pages").filter((item) => item.websiteId === id), runs: seed().runs.filter((item) => item.websiteId === id) });
}

export async function PATCH(request, { params }) {
  const { id } = await params; const body = await request.json(); const patch = { name: typeof body.name === "string" ? body.name.trim().slice(0, 160) : undefined, categories: Array.isArray(body.categories) ? body.categories.slice(0, 20) : undefined, authorized: body.authorized === true };
  try { if (process.env.MONGODB_URI) { await connectDb(); const website = await Website.findByIdAndUpdate(id, patch, { new: true, runValidators: true }).lean(); return website ? NextResponse.json({ website }) : NextResponse.json({ error: "Website not found." }, { status: 404 }); } } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  return NextResponse.json({ website: update("websites", id, patch) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  try { if (process.env.MONGODB_URI) { await connectDb(); const website = await Website.findByIdAndDelete(id); if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 }); await Promise.all([DiscoveredPage.deleteMany({ websiteId: id }), TestCase.deleteMany({ websiteId: id }), TestRun.deleteMany({ websiteId: id }), Bug.deleteMany({ websiteId: id })]); return NextResponse.json({ deleted: true }); } } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const websites = seed().websites; const index = websites.findIndex((item) => item._id === id); if (index < 0) return NextResponse.json({ error: "Website not found." }, { status: 404 }); websites.splice(index, 1); return NextResponse.json({ deleted: true });
}
