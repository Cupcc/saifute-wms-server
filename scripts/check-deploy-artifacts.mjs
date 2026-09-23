#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const MANIFEST_NAME = ".deploy-manifest.json";
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".vue",
  ".json",
  ".prisma",
  ".css",
]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "prepare" || key === "verify") {
      args[key] = true;
      continue;
    }
    args[key] = argv[i + 1];
    i += 1;
  }
  return args;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function listFiles(root, predicate = () => true) {
  const files = [];
  async function visit(current, relative = "") {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      const rel = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(file, rel);
      else if (entry.isFile() && predicate(rel))
        files.push({ absolute: file, relative: rel });
    }
  }
  await visit(root);
  return files;
}

async function digestFiles(files) {
  const hashes = [];
  for (const file of files)
    hashes.push(
      `${file.relative}\0${sha256(await fs.readFile(file.absolute))}`,
    );
  return { count: hashes.length, digest: sha256(hashes.join("\n")) };
}

function isSourceFile(relative) {
  const normalized = relative.split(path.sep).join("/");
  if (
    normalized.includes("/node_modules/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("generated/")
  )
    return false;
  return SOURCE_EXTENSIONS.has(path.extname(normalized));
}

async function sourceFingerprint(source) {
  const roots = [
    "src",
    "web/src",
    "prisma/schema.prisma",
    "package.json",
    "web/package.json",
  ];
  const files = [];
  for (const relative of roots) {
    const absolute = path.join(source, relative);
    const stat = await fs.stat(absolute);
    if (stat.isDirectory())
      files.push(
        ...(await listFiles(absolute, isSourceFile)).map((file) => ({
          ...file,
          relative: path.join(relative, file.relative),
        })),
      );
    else if (isSourceFile(relative)) files.push({ absolute, relative });
  }
  return digestFiles(
    files.sort((a, b) => a.relative.localeCompare(b.relative)),
  );
}

async function artifactFingerprint(root) {
  const result = {};
  for (const relative of ["dist", "generated", "web/dist"]) {
    result[relative] = await digestFiles(
      await listFiles(
        path.join(root, relative),
        (file) => file !== MANIFEST_NAME,
      ),
    );
  }
  result.package = await digestFiles([
    { absolute: path.join(root, "package.json"), relative: "package.json" },
  ]);
  return result;
}

function gitCommit(source) {
  try {
    return execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function prepare(source) {
  const manifest = {
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
    sourceCommit: gitCommit(source),
    sourceFingerprint: await sourceFingerprint(source),
    artifactFingerprint: await artifactFingerprint(source),
    packageVersion: (await readJson(path.join(source, "package.json"))).version,
  };
  await fs.writeFile(
    path.join(source, "dist", MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `[deploy-artifacts] prepared ${manifest.packageVersion} ${manifest.sourceFingerprint.digest}`,
  );
}

async function verify(source, deploy) {
  const sourceManifest = await readJson(
    path.join(source, "dist", MANIFEST_NAME),
  );
  const deployManifest = await readJson(
    path.join(deploy, "dist", MANIFEST_NAME),
  );
  if (
    (await sourceFingerprint(source)).digest !==
    sourceManifest.sourceFingerprint.digest
  )
    throw new Error("源码在构建后发生变化，请重新构建");
  if (JSON.stringify(sourceManifest) !== JSON.stringify(deployManifest))
    throw new Error("部署目录构建清单不一致");
  if (
    JSON.stringify(await artifactFingerprint(deploy)) !==
    JSON.stringify(sourceManifest.artifactFingerprint)
  )
    throw new Error(
      "dist、generated、web/dist 或 package.json 不是同一次构建产物",
    );
  const sourcePackage = await readJson(path.join(source, "package.json"));
  const deployPackage = await readJson(path.join(deploy, "package.json"));
  if (sourcePackage.version !== deployPackage.version)
    throw new Error(
      `package 版本不一致: source=${sourcePackage.version}, deploy=${deployPackage.version}`,
    );
  console.log(
    `[deploy-artifacts] verified ${deployPackage.version} ${sourceManifest.sourceFingerprint.digest}`,
  );
}

const args = parseArgs(process.argv.slice(2));
const source = path.resolve(args.source ?? process.cwd());
if (args.prepare) await prepare(source);
else if (args.verify) await verify(source, path.resolve(args.deploy));
else
  throw new Error(
    "Usage: check-deploy-artifacts.mjs --source <source> --prepare | --source <source> --deploy <deploy> --verify",
  );
