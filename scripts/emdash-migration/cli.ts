#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { EmDashMigrationApi } from "./emdash-api.ts";
import { buildMigrationPlan } from "./inventory.ts";
import type {
  ImportReceipt,
  MigrationIssue,
  MigrationPlan,
  PendingWrite,
} from "./types.ts";
import { normalizeTarget } from "./validation.ts";

type Options = {
  target?: string;
  write: boolean;
  planPath: string;
  receiptPath: string;
  confirm?: string;
  only: string[];
};

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.target) options.target = normalizeTarget(options.target);
  if (options.write && !options.target)
    throw new Error("Write mode requires --target <url>.");
  if (!options.write) return run(options);
  const lockPath = `.migration/emdash/${targetKey(options.target!)}.lock`;
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  const lock = await open(lockPath, "wx", 0o600).catch(() => {
    throw new Error(
      `Another import may be running. Inspect ${lockPath} before removing a stale lock.`,
    );
  });
  try {
    await lock.writeFile(String(process.pid));
    await run(options);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function run(options: Options): Promise<void> {
  const plan = buildMigrationPlan(process.cwd(), {
    only: options.only,
    target: options.target,
  });

  if (!options.write) {
    await writeJson(options.planPath, plan);
  } else {
    const approvedPlan = z
      .object({ digest: z.string() })
      .parse(JSON.parse(await readFile(options.planPath, "utf8")));
    if (approvedPlan.digest !== plan.digest) {
      throw new Error(
        `The source inventory changed after the plan was generated. Expected ${approvedPlan.digest}, now ${plan.digest}. Run a new dry run.`,
      );
    }
    if (options.confirm !== plan.digest) {
      throw new Error(`Write mode requires --confirm ${plan.digest}`);
    }
  }

  printPlan(plan, options.planPath);
  assertNoErrors([
    ...plan.issues,
    ...plan.posts.flatMap((post) => post.issues),
  ]);

  if (!options.target) {
    if (options.write) throw new Error("Write mode requires --target <url>.");
    return;
  }

  const api = new EmDashMigrationApi(options.target);
  const preflightIssues = await api.preflight(plan.posts);
  printIssues("Destination preflight", preflightIssues);
  assertNoErrors(preflightIssues);

  const statePath = `.migration/emdash/${targetKey(options.target)}.state.json`;
  const pendingSchema = z.record(
    z.string(),
    z.object({
      entryId: z.string(),
      revision: z.string(),
      sourceHash: z.string(),
      payloadHash: z.string(),
    }),
  );
  let pending: Record<string, PendingWrite> = {};
  try {
    pending = pendingSchema.parse(
      JSON.parse(await readFile(statePath, "utf8")),
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  const operations = await api.planOperations(plan.posts, pending);
  const operationCounts = countBy(
    operations.map((operation) => operation.action),
  );
  console.log("\nDestination operations");
  console.log(`  create:   ${operationCounts.create ?? 0}`);
  console.log(`  update:   ${operationCounts.update ?? 0}`);
  console.log(`  skip:     ${operationCounts.skip ?? 0}`);
  console.log(`  resume:   ${operationCounts.resume ?? 0}`);
  console.log(`  conflict: ${operationCounts.conflict ?? 0}`);

  const conflicts = operations.filter(
    (operation) => operation.action === "conflict",
  );
  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      console.error(
        `  conflict ${conflict.post.sourcePath}: ${conflict.reason}`,
      );
    }
    throw new Error("Resolve destination conflicts before writing.");
  }

  if (!options.write) return;

  const receipt: ImportReceipt = {
    version: 1,
    target: options.target,
    planDigest: plan.digest,
    startedAt: new Date().toISOString(),
    completedAt: "",
    items: [],
  };

  for (const operation of operations) {
    let result: { entryId?: string; message: string };
    try {
      result = await api.execute(operation, async (checkpoint) => {
        pending[operation.post.sourcePath] = checkpoint;
        await writeJson(statePath, pending);
      });
    } catch (error) {
      receipt.items.push({
        sourcePath: operation.post.sourcePath,
        action: "failed",
        entryId: pending[operation.post.sourcePath]?.entryId,
        message:
          error instanceof Error ? error.message : "Import operation failed.",
      });
      await writeJson(options.receiptPath, receipt);
      throw new Error(
        `Import stopped at ${operation.post.sourcePath}. Review ${options.receiptPath} and rerun after resolving the failure.`,
      );
    }
    receipt.items.push({
      sourcePath: operation.post.sourcePath,
      action: operation.action,
      entryId: result.entryId,
      message: result.message,
    });
    await writeJson(options.receiptPath, receipt);
    delete pending[operation.post.sourcePath];
    await writeJson(statePath, pending);
    console.log(`${operation.action.padEnd(6)} ${operation.post.sourcePath}`);
  }

  receipt.completedAt = new Date().toISOString();
  await writeJson(options.receiptPath, receipt);
  console.log(`\nImport complete. Receipt: ${options.receiptPath}`);
}

function parseArguments(args: string[]): Options {
  const options: Options = {
    write: false,
    planPath: ".migration/emdash/plan.json",
    receiptPath: ".migration/emdash/receipt.json",
    only: [],
  };

  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    switch (argument) {
      case "--target":
        options.target = requireValue(args, ++index, argument);
        break;
      case "--only":
        options.only.push(requireValue(args, ++index, argument));
        break;
      case "--write":
        options.write = true;
        break;
      case "--plan":
        options.planPath = requireValue(args, ++index, argument);
        break;
      case "--receipt":
        options.receiptPath = requireValue(args, ++index, argument);
        break;
      case "--confirm":
        options.confirm = requireValue(args, ++index, argument);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value.`);
  return value;
}

function printPlan(plan: MigrationPlan, planPath: string): void {
  console.log("EmDash post migration plan");
  console.log(`  digest:         ${plan.digest}`);
  console.log(`  target:         ${plan.target ?? "offline"}`);
  console.log(`  tracked posts:  ${plan.summary.total}`);
  console.log(`  local articles: ${plan.summary.localArticles}`);
  console.log(`  external links: ${plan.summary.externalLinks}`);
  console.log(`  published:      ${plan.summary.published}`);
  console.log(`  drafts:         ${plan.summary.drafts}`);
  console.log(`  warnings:       ${plan.summary.warnings}`);
  console.log(`  errors:         ${plan.summary.errors}`);
  console.log(`  plan:           ${planPath}`);

  const issues = [...plan.issues, ...plan.posts.flatMap((post) => post.issues)];
  printIssues("Source issues", issues);
}

function printIssues(heading: string, issues: MigrationIssue[]): void {
  if (issues.length === 0) return;
  console.log(`\n${heading}`);
  for (const issue of issues) {
    const source = issue.sourcePath ? ` ${issue.sourcePath}` : "";
    console.log(
      `  ${issue.severity.toUpperCase()} ${issue.code}${source}: ${issue.message}`,
    );
  }
}

function assertNoErrors(issues: MigrationIssue[]): void {
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `Migration plan contains ${errors.length} blocking error(s).`,
    );
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const absolutePath = path.resolve(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${absolutePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, absolutePath);
}

function targetKey(target: string): string {
  return createHash("sha256").update(target).digest("hex").slice(0, 16);
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function printHelp(): void {
  console.log(`Usage: pnpm migrate:posts [options]

Dry-run is the default. It inventories tracked Markdown posts and writes a deterministic plan.

Options:
  --target <url>     Preflight a running EmDash instance and plan destination operations
  --write            Apply an approved plan
  --only <path>      Select a tracked source file; repeat for representative imports
  --plan <path>      Plan path (default: .migration/emdash/plan.json)
  --receipt <path>   Receipt path (default: .migration/emdash/receipt.json)
  --confirm <digest> Required in write mode; must equal the plan digest
  -h, --help         Show this help

Authentication:
  All targets require EMDASH_TOKEN. Preflight never establishes a dev-bypass session.
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
