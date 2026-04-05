import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";

function envString(name) {
  const value = process.env[name];
  return value == null ? "" : String(value).trim();
}

export function resolveOpenClawWeixinDir(explicitDir = "") {
  if (explicitDir?.trim()) return explicitDir.trim();
  if (envString("ZCLAW_WEIXIN_DIR")) return envString("ZCLAW_WEIXIN_DIR");

  const stateDir =
    envString("OPENCLAW_STATE_DIR") ||
    envString("CLAWDBOT_STATE_DIR") ||
    path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "openclaw-weixin");
}

function readJsonFile(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

export function listWeixinAccountIds(weixinDir = "") {
  const dir = resolveOpenClawWeixinDir(weixinDir);
  const indexPath = path.join(dir, "accounts.json");
  const parsed = readJsonFile(indexPath, []);
  return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id.trim()) : [];
}

export function loadWeixinAccount(weixinDir = "", accountId) {
  if (!accountId) return null;
  const dir = resolveOpenClawWeixinDir(weixinDir);
  return readJsonFile(path.join(dir, "accounts", `${accountId}.json`), null);
}

export function loadWeixinContextTokens(weixinDir = "", accountId) {
  if (!accountId) return {};
  const dir = resolveOpenClawWeixinDir(weixinDir);
  const parsed = readJsonFile(path.join(dir, "accounts", `${accountId}.context-tokens.json`), {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function resolveOpenClawWeixinAccount({ weixinDir = "", accountId = "" } = {}) {
  const dir = resolveOpenClawWeixinDir(weixinDir);
  const resolvedAccountId = accountId?.trim() || listWeixinAccountIds(dir)[0] || "";
  if (!resolvedAccountId) {
    throw new Error("没有找到 openclaw 微信账号，请先运行 openclaw channels login --channel openclaw-weixin");
  }

  const data = loadWeixinAccount(dir, resolvedAccountId);
  if (!data?.token) {
    throw new Error(`openclaw 微信账号 ${resolvedAccountId} 缺少 token，请重新登录`);
  }

  return {
    accountId: resolvedAccountId,
    token: data.token,
    baseUrl: data.baseUrl || DEFAULT_BASE_URL,
    data,
  };
}

export function resolveDirectWeixinTarget({
  weixinDir = "",
  accountId = "",
  explicitUserId = "",
  explicitContextToken = "",
} = {}) {
  const account = resolveOpenClawWeixinAccount({ weixinDir, accountId });
  const accountData = account.data || {};
  const contextTokens = loadWeixinContextTokens(weixinDir, account.accountId);

  const explicitUser = explicitUserId?.trim();
  if (explicitUser) {
    return {
      userId: explicitUser,
      contextToken: explicitContextToken?.trim() || contextTokens[explicitUser] || "",
    };
  }

  const latestUser = accountData?.latestTarget?.userId?.trim();
  if (latestUser) {
    return {
      userId: latestUser,
      contextToken:
        accountData?.latestTarget?.contextToken?.trim() ||
        contextTokens[latestUser] ||
        "",
    };
  }

  const entries = Object.entries(contextTokens)
    .filter(([userId, token]) => typeof userId === "string" && userId.trim() && typeof token === "string");
  if (entries.length === 1) {
    const [userId, contextToken] = entries[0];
    return { userId, contextToken };
  }

  throw new Error(
    "无法确定微信收件人。请先让对方给 bot 发一条消息，或在环境变量中设置 WEIXIN_TO_USER_ID",
  );
}

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function postHeaders(token, body) {
  const headers = {
    "Content-Type": "application/json",
    "AuthorizationType": "ilink_bot_token",
    "X-WECHAT-UIN": randomWechatUin(),
    "iLink-App-Id": "bot",
  };

  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  if (body != null) {
    headers["Content-Length"] = String(Buffer.byteLength(body, "utf-8"));
  }
  return headers;
}

export async function sendOpenClawWeixinText({
  weixinDir = "",
  accountId = "",
  explicitUserId = "",
  explicitContextToken = "",
  text,
} = {}) {
  const account = resolveOpenClawWeixinAccount({ weixinDir, accountId });
  const target = resolveDirectWeixinTarget({
    weixinDir,
    accountId: account.accountId,
    explicitUserId,
    explicitContextToken,
  });

  const url = `${account.baseUrl || DEFAULT_BASE_URL}/ilink/bot/sendmessage`;
  const body = JSON.stringify({
    msg: {
      to_user_id: target.userId,
      context_token: target.contextToken || "",
      item_list: [{ type: 1, text_item: { text } }],
    },
  });

  const response = await fetch(url, {
    method: "POST",
    headers: postHeaders(account.token, body),
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`sendMessage HTTP ${response.status}: ${responseText}`);
  }

  let parsed = {};
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = {};
  }

  return {
    accountId: account.accountId,
    userId: target.userId,
    contextToken: target.contextToken,
    response: parsed,
  };
}
