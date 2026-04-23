import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("start-http.ps1 avoids the reserved Host parameter name", async () => {
  const scriptPath = path.resolve("start-http.ps1");
  const text = await fs.readFile(scriptPath, "utf8");

  assert.doesNotMatch(text, /\[string\]\s*\$Host\b/);
  assert.match(text, /\[string\]\s*\$BindHost\b/);
  assert.match(text, /--host/);
});

test("start-configure.ps1 exists as a Windows wrapper for --configure", async () => {
  const scriptPath = path.resolve("start-configure.ps1");
  const text = await fs.readFile(scriptPath, "utf8");

  assert.match(text, /server\.mjs/);
  assert.match(text, /--configure/);
  assert.doesNotMatch(text, /\[string\]\s*\$Host\b/);
});
