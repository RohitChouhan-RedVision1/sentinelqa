import { NextResponse } from "next/server";
import { connectDb } from "@/lib/db";
import { Website, DiscoveredPage, TestCase } from "@/lib/models";
import { scanWebsite } from "@/lib/scanner";
import { add } from "@/lib/store";

export const maxDuration = 60;

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.authorized !== true) return NextResponse.json({ error: "Confirm that you own or are authorized to test this website." }, { status: 400 });
    const result = await scanWebsite(body.url);
    const name = result.host.replace(/^www\./, "").split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    if (process.env.MONGODB_URI) {
      await connectDb();
      const website = await Website.findOneAndUpdate({ host: result.host }, { $set: { url: result.url, host: result.host, name, status: "ready", authorized: true, pageCount: result.pages.length, lastScanAt: new Date() } }, { upsert: true, new: true });
      await DiscoveredPage.deleteMany({ websiteId: website._id });
      await DiscoveredPage.insertMany(result.pages.map((page) => ({ ...page, websiteId: website._id, internalLinks: undefined })));
      return NextResponse.json({ website: website.toObject(), pages: result.pages, durationMs: result.durationMs });
    }
    const website = add("websites", { name, host: result.host, url: result.url, status: "ready", authorized: true, pageCount: result.pages.length, testCount: result.pages.length * 3, lastScanAt: new Date().toISOString(), categories: ["UI Testing", "SEO Testing", "Accessibility Testing"] });
    result.pages.forEach((page) => add("pages", { ...page, websiteId: website._id, internalLinks: undefined }));
    return NextResponse.json({ website, pages: result.pages, durationMs: result.durationMs });
  } catch (error) { return NextResponse.json({ error: error.message || "Scan failed" }, { status: 400 }); }
}
