const store = globalThis.__sentinelStore || (globalThis.__sentinelStore = {
  websites: [], pages: [], testCases: [], runs: [], results: [], bugs: []
});

export function id() { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
export function list(collection) { return store[collection]; }
export function add(collection, value) { const record = { _id: id(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...value }; store[collection].unshift(record); return record; }
export function update(collection, recordId, patch) { const item = store[collection].find((entry) => entry._id === recordId); if (!item) return null; Object.assign(item, patch, { updatedAt: new Date().toISOString() }); return item; }
export function seed() {
  if (store.websites.length) return store;
  const website = add("websites", { name: "Northstar Finance", host: "northstar.finance", url: "https://northstar.finance", status: "ready", pageCount: 42, testCount: 128, lastScanAt: new Date(Date.now() - 1000 * 60 * 34).toISOString(), categories: ["UI Testing", "SEO Testing", "Accessibility Testing"] });
  add("websites", { name: "Atlas Commerce", host: "atlascommerce.io", url: "https://atlascommerce.io", status: "ready", pageCount: 18, testCount: 74, lastScanAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), categories: ["Functional Testing", "Performance Testing"] });
  add("websites", { name: "Orbit HR", host: "orbithr.app", url: "https://orbithr.app", status: "scanning", pageCount: 9, testCount: 31, lastScanAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(), categories: ["Authentication Testing"] });
  const cases = [
    ["Verify primary navigation links", "Navigation Testing", "high", "passed"],
    ["Check homepage hero image alt text", "Accessibility Testing", "medium", "passed"],
    ["Validate required email field", "Form Validation Testing", "high", "failed"],
    ["Check mobile viewport overflow", "Responsive Testing", "medium", "passed"],
    ["Verify sitemap.xml is reachable", "SEO Testing", "low", "pending"]
  ];
  cases.forEach(([title, category, priority, status]) => add("testCases", { title, category, priority, status, websiteId: website._id, description: "Confirm this behavior matches the approved product expectation.", instructions: "Exercise the flow and capture evidence for any deviation.", expectedResult: "The page behaves consistently and communicates its state clearly." }));
  add("bugs", { title: "Required email validation allows malformed address", pageUrl: "https://northstar.finance/contact", severity: "high", status: "open", description: "The form accepts a value without a valid domain.", browser: "Chromium 128" });
  add("bugs", { title: "Mobile nav focus ring is clipped", pageUrl: "https://atlascommerce.io/products", severity: "medium", status: "triaged", description: "Keyboard focus is partially hidden at 390px width.", browser: "WebKit 18" });
  return store;
}
