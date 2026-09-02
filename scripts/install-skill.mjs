#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, ".agents", "skills", "codex-project");
const skillsDir = path.join(os.homedir(), ".agents", "skills");
const destination = path.join(skillsDir, "codex-project");
const legacyDestination = path.join(skillsDir, "init-codex-project");

fs.mkdirSync(skillsDir, { recursive: true });
installLink(source, destination);
removeLegacyLink(legacyDestination);
console.log(`skill_installed: ${destination}`);

function installLink(linkSource, linkDestination) {
  const existing = lstatIfExists(linkDestination);
  if (existing) {
    if (!existing.isSymbolicLink()) {
      throw new Error(`skill destination exists and is not a managed link: ${linkDestination}`);
    }
    if (sameRealPath(linkSource, linkDestination)) {
      return;
    }
    fs.unlinkSync(linkDestination);
  }
  fs.symlinkSync(linkSource, linkDestination, process.platform === "win32" ? "junction" : "dir");
}

function removeLegacyLink(linkPath) {
  const existing = lstatIfExists(linkPath);
  if (existing?.isSymbolicLink()) {
    fs.unlinkSync(linkPath);
  }
}

function lstatIfExists(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function sameRealPath(left, right) {
  try {
    const leftReal = fs.realpathSync(left);
    const rightReal = fs.realpathSync(right);
    if (process.platform === "win32") {
      return leftReal.toLowerCase() === rightReal.toLowerCase();
    }
    return leftReal === rightReal;
  } catch {
    return false;
  }
}
