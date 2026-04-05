import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  resolveDirectWeixinTarget,
  resolveOpenClawWeixinAccount,
} from "../../scripts/lib/openclaw_weixin_client.mjs";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "zclaw-weixin-test-"));
}

test("resolveOpenClawWeixinAccount loads the first saved account by default", () => {
  const dir = makeTempDir();
  const accountsDir = path.join(dir, "accounts");
  fs.mkdirSync(accountsDir, { recursive: true });
  fs.writeFileSync(path.join(dir, "accounts.json"), JSON.stringify(["bot-a"]), "utf-8");
  fs.writeFileSync(
    path.join(accountsDir, "bot-a.json"),
    JSON.stringify({ token: "tok-a", baseUrl: "https://ilinkai.weixin.qq.com" }),
    "utf-8",
  );

  const account = resolveOpenClawWeixinAccount({ weixinDir: dir });
  assert.equal(account.accountId, "bot-a");
  assert.equal(account.token, "tok-a");
});

test("resolveDirectWeixinTarget prefers persisted latestTarget", () => {
  const dir = makeTempDir();
  const accountsDir = path.join(dir, "accounts");
  fs.mkdirSync(accountsDir, { recursive: true });
  fs.writeFileSync(path.join(dir, "accounts.json"), JSON.stringify(["bot-a"]), "utf-8");
  fs.writeFileSync(
    path.join(accountsDir, "bot-a.json"),
    JSON.stringify({
      token: "tok-a",
      latestTarget: {
        userId: "latest@im.wechat",
        contextToken: "ctx-latest",
      },
    }),
    "utf-8",
  );

  const target = resolveDirectWeixinTarget({
    weixinDir: dir,
    accountId: "bot-a",
    explicitUserId: "",
    explicitContextToken: "",
  });

  assert.deepEqual(target, {
    userId: "latest@im.wechat",
    contextToken: "ctx-latest",
  });
});

test("resolveDirectWeixinTarget falls back to a single known context token", () => {
  const dir = makeTempDir();
  const accountsDir = path.join(dir, "accounts");
  fs.mkdirSync(accountsDir, { recursive: true });
  fs.writeFileSync(path.join(dir, "accounts.json"), JSON.stringify(["bot-a"]), "utf-8");
  fs.writeFileSync(
    path.join(accountsDir, "bot-a.json"),
    JSON.stringify({ token: "tok-a" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(accountsDir, "bot-a.context-tokens.json"),
    JSON.stringify({
      "friend@im.wechat": "ctx-1",
    }),
    "utf-8",
  );

  const target = resolveDirectWeixinTarget({
    weixinDir: dir,
    accountId: "bot-a",
    explicitUserId: "",
    explicitContextToken: "",
  });

  assert.deepEqual(target, {
    userId: "friend@im.wechat",
    contextToken: "ctx-1",
  });
});

test("resolveDirectWeixinTarget respects explicit target and auto-fills known context token", () => {
  const dir = makeTempDir();
  const accountsDir = path.join(dir, "accounts");
  fs.mkdirSync(accountsDir, { recursive: true });
  fs.writeFileSync(path.join(dir, "accounts.json"), JSON.stringify(["bot-a"]), "utf-8");
  fs.writeFileSync(
    path.join(accountsDir, "bot-a.json"),
    JSON.stringify({ token: "tok-a" }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(accountsDir, "bot-a.context-tokens.json"),
    JSON.stringify({
      "friend@im.wechat": "ctx-1",
    }),
    "utf-8",
  );

  const target = resolveDirectWeixinTarget({
    weixinDir: dir,
    accountId: "bot-a",
    explicitUserId: "friend@im.wechat",
    explicitContextToken: "",
  });

  assert.deepEqual(target, {
    userId: "friend@im.wechat",
    contextToken: "ctx-1",
  });
});
