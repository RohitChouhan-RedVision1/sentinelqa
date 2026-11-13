import mongoose from "mongoose";

const schemaOptions = { timestamps: true, versionKey: false };
const TestCaseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true }, description: String, instructions: String,
  expectedResult: String, actualResult: String, status: { type: String, enum: ["pending", "passed", "failed", "blocked", "na"], default: "pending" },
  priority: { type: String, enum: ["low", "medium", "high", "critical"], default: "medium" }, category: { type: String, default: "UI Testing" },
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: "Website" }, notes: String, bugDescription: String
}, schemaOptions);
TestCaseSchema.index({ websiteId: 1, status: 1 });

const WebsiteSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true }, name: String, host: String,
  status: { type: String, enum: ["queued", "scanning", "ready", "failed"], default: "queued" },
  pageCount: { type: Number, default: 0 }, testCount: { type: Number, default: 0 }, lastScanAt: Date,
  categories: [String], authorized: { type: Boolean, default: false }
}, schemaOptions);
WebsiteSchema.index({ host: 1 });

const PageSchema = new mongoose.Schema({
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: "Website", index: true }, url: String, path: String,
  title: String, category: String, links: Number, forms: Number, buttons: Number, inputs: Number, statusCode: Number,
  hasMetaDescription: Boolean, missingAlt: Number, robotsAllowed: Boolean
}, schemaOptions);

const TestRunSchema = new mongoose.Schema({
  websiteId: { type: mongoose.Schema.Types.ObjectId, ref: "Website" }, targetUrl: { type: String, required: true }, status: { type: String, enum: ["queued", "running", "completed", "stopped", "failed", "inconclusive"], default: "queued" },
  categories: [String], selectedPageIds: [String], selectedPageUrls: [String], testCaseIds: [String], total: { type: Number, default: 0 }, passed: { type: Number, default: 0 }, failed: { type: Number, default: 0 }, blocked: { type: Number, default: 0 }, inconclusive: { type: Number, default: 0 }, completedCount: { type: Number, default: 0 }, progressPct: { type: Number, default: 0 }, currentCategory: String, durationMs: Number, startedAt: Date, completedAt: Date, githubRunId: String, githubWorkflowId: String, githubConclusion: String, dispatchKey: { type: String, index: true }, callbackDigest: String, error: String
}, schemaOptions);
TestRunSchema.index({ websiteId: 1, createdAt: -1 });

const TestResultSchema = new mongoose.Schema({ runId: { type: mongoose.Schema.Types.ObjectId, ref: "TestRun", index: true }, resultKey: String, testCaseId: { type: mongoose.Schema.Types.ObjectId, ref: "TestCase" }, title: String, category: String, status: { type: String, enum: ["passed", "failed", "blocked", "inconclusive"] }, severity: String, evidence: String, consoleErrors: [String], failedRequests: [String], screenshot: String, browser: String, durationMs: Number }, schemaOptions);
TestResultSchema.index({ runId: 1, resultKey: 1 }, { unique: true, sparse: true });
const BugSchema = new mongoose.Schema({ runId: { type: mongoose.Schema.Types.ObjectId, ref: "TestRun" }, resultKey: String, websiteId: { type: mongoose.Schema.Types.ObjectId, ref: "Website" }, pageUrl: String, title: { type: String, required: true }, description: String, steps: String, expected: String, actual: String, severity: { type: String, enum: ["critical", "high", "medium", "low"], default: "medium" }, screenshot: String, browser: String, status: { type: String, enum: ["open", "triaged", "resolved", "wont_fix"], default: "open" } }, schemaOptions);
BugSchema.index({ runId: 1, resultKey: 1 }, { unique: true, sparse: true });
const AttachmentSchema = new mongoose.Schema({ testResultId: mongoose.Schema.Types.ObjectId, filename: String, mimeType: String, storageKey: String, size: Number }, schemaOptions);
const UserSchema = new mongoose.Schema({ email: { type: String, unique: true }, name: String, role: { type: String, default: "tester" } }, schemaOptions);
const TestCategorySchema = new mongoose.Schema({ name: { type: String, required: true, trim: true, unique: true }, description: String, builtIn: { type: Boolean, default: false }, enabled: { type: Boolean, default: true } }, schemaOptions);

export const Website = mongoose.models.Website || mongoose.model("Website", WebsiteSchema);
export const DiscoveredPage = mongoose.models.DiscoveredPage || mongoose.model("DiscoveredPage", PageSchema);
export const TestCase = mongoose.models.TestCase || mongoose.model("TestCase", TestCaseSchema);
export const TestRun = mongoose.models.TestRun || mongoose.model("TestRun", TestRunSchema);
export const TestResult = mongoose.models.TestResult || mongoose.model("TestResult", TestResultSchema);
export const Bug = mongoose.models.Bug || mongoose.model("Bug", BugSchema);
export const TestAttachment = mongoose.models.TestAttachment || mongoose.model("TestAttachment", AttachmentSchema);
export const User = mongoose.models.User || mongoose.model("User", UserSchema);
export const TestCategory = mongoose.models.TestCategory || mongoose.model("TestCategory", TestCategorySchema);
