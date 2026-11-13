import { NextResponse } from "next/server";

const buildPlan = (pages, categories) => pages.flatMap((page) => categories.slice(0, 6).map((category) => ({ title: `${category}: ${page.path}`, category, priority: category.includes("Security") || category.includes("Authentication") ? "high" : "medium", description: `Validate the ${category.toLowerCase()} expectations for ${page.path}.`, instructions: "Exercise valid and invalid states without submitting destructive actions, then attach evidence for deviations.", expectedResult: "The page behaves as documented and communicates success or failure clearly." })));

export async function POST(request) {
  const body = await request.json(); const pages = Array.isArray(body.pages) ? body.pages.slice(0, 25) : []; const categories = Array.isArray(body.categories) && body.categories.length ? body.categories : ["UI Testing", "SEO Testing", "Accessibility Testing"];
  if (!pages.length) return NextResponse.json({ error: "At least one discovered page is required." }, { status: 400 });
  return NextResponse.json({ provider: "rule-based", testCases: buildPlan(pages, categories), note: "Generated locally without external AI services." });
}
