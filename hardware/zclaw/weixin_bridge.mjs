/**
 * weixin_bridge.mjs — 微信 iLink ↔ MQTT ↔ zclaw 独立桥接
 *
 * 命令：
 *   node weixin_bridge.mjs login     扫码登录，保存 token
 *   node weixin_bridge.mjs accounts  列出已保存的账号
 *   node weixin_bridge.mjs           启动 MQTT 桥接（默认）
 *   node weixin_bridge.mjs bridge    同上
 *
 * 依赖：npm install mqtt              （仅桥接命令需要）
 *       npm install qrcode-terminal  （login 命令可选，用于终端显示二维码）
 *
 * 环境变量（优先级：环境变量 > 默认值）：
 *   ZCLAW_WEIXIN_DIR   状态目录，默认 ~/.openclaw/openclaw-weixin（兼容已有 openclaw 账号）
 *   WEIXIN_BRIDGE_MODE 桥接模式：mqtt 或 relay
 *   MQTT_URI           MQTT broker URI，如 mqtts://xxx.emqxsl.cn:8883
 *   MQTT_USER          MQTT 用户名
 *   MQTT_PASS          MQTT 密码
 *   MQTT_TOPIC         话题前缀，默认 zclaw
 *   ZCLAW_WEB_RELAY_URL relay 模式下的本地 web relay 地址，默认 http://127.0.0.1:8787/api/chat
 *   ZCLAW_WEB_API_KEY   relay 模式请求头 X-Zclaw-Key（可选）
 *   WEIXIN_ACCOUNT     指定账号 ID，不填则自动使用第一个
 */

import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";
import crypto from "node:crypto";
import { createRequire } from "node:module";

import { loadBridgeConfig, relayChat } from "./scripts/lib/weixin_bridge_lib.mjs";

const require = createRequire(import.meta.url);

// ── 常量 ──────────────────────────────────────────────────────

const ILINK_BASE_URL        = "https://ilinkai.weixin.qq.com";
const ILINK_APP_ID          = "bot";
const BOT_TYPE              = "3";
const QR_LONG_POLL_MS       = 35_000;
const GETUPDATES_TIMEOUT_MS = 35_000;
const SEND_TIMEOUT_MS       = 15_000;
const MAX_QR_REFRESH        = 3;

// ── 状态目录 ──────────────────────────────────────────────────

function resolveWeixinDir() {
  if (process.env.ZCLAW_WEIXIN_DIR?.trim()) {
    return process.env.ZCLAW_WEIXIN_DIR.trim();
  }
  const stateDir =
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    process.env.CLAWDBOT_STATE_DIR?.trim()  ||
    path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "openclaw-weixin");
}

const WEIXIN_DIR     = resolveWeixinDir();
const ACCOUNTS_DIR   = path.join(WEIXIN_DIR, "accounts");
const ACCOUNTS_INDEX = path.join(WEIXIN_DIR, "accounts.json");

// ── 账号管理 ──────────────────────────────────────────────────

function listAccountIds() {
  try {
    if (!fs.existsSync(ACCOUNTS_INDEX)) return [];
    const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_INDEX, "utf-8"));
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === "string" && id.trim()) : [];
  } catch { return []; }
}

function registerAccountId(accountId) {
  fs.mkdirSync(WEIXIN_DIR, { recursive: true });
  const existing = listAccountIds();
  if (existing.includes(accountId)) return;
  fs.writeFileSync(ACCOUNTS_INDEX, JSON.stringify([...existing, accountId], null, 2), "utf-8");
}

function accountFilePath(accountId) {
  return path.join(ACCOUNTS_DIR, `${accountId}.json`);
}

function loadAccount(accountId) {
  try {
    const p = accountFilePath(accountId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {}
  return null;
}

function saveAccount(accountId, data) {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  const existing = loadAccount(accountId) || {};
  const updated = {
    ...existing,
    ...data,
    savedAt: new Date().toISOString(),
  };
  const p = accountFilePath(accountId);
  fs.writeFileSync(p, JSON.stringify(updated, null, 2), "utf-8");
  try { fs.chmodSync(p, 0o600); } catch {}
}

function extractLatestTarget(data) {
  const userId = data?.latestTarget?.userId?.trim();
  if (!userId) return null;
  return {
    userId,
    contextToken: data?.latestTarget?.contextToken?.trim() || "",
  };
}

function saveLatestTarget(accountId, userId, contextToken) {
  const trimmedUserId = userId?.trim();
  if (!trimmedUserId) return false;

  const current = extractLatestTarget(loadAccount(accountId));
  const next = {
    userId: trimmedUserId,
    contextToken: contextToken?.trim() || "",
  };

  if (current &&
      current.userId === next.userId &&
      current.contextToken === next.contextToken) {
    return false;
  }

  saveAccount(accountId, {
    latestTarget: {
      ...next,
      savedAt: new Date().toISOString(),
    },
  });
  return true;
}

function resolveAccount(accountId) {
  const id = accountId || process.env.WEIXIN_ACCOUNT?.trim();
  if (id) {
    const data = loadAccount(id);
    if (!data?.token) throw new Error(`账号 ${id} 的 token 不存在，请先运行 node weixin_bridge.mjs login`);
    return { accountId: id, ...data };
  }
  const ids = listAccountIds();
  if (!ids.length) throw new Error("没有找到已登录的微信账号，请先运行：node weixin_bridge.mjs login");
  const first = ids[0];
  const data = loadAccount(first);
  if (!data?.token) throw new Error(`账号 ${first} 的 token 不存在，请先运行 node weixin_bridge.mjs login`);
  return { accountId: first, ...data };
}

// ── 公共请求头 ────────────────────────────────────────────────

function randomWechatUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

/** GET 请求头（登录流程用，不含 Authorization） */
function getHeaders() {
  return {
    "iLink-App-Id": ILINK_APP_ID,
  };
}

/** POST 请求头（消息收发用） */
function postHeaders(token, body) {
  const headers = {
    "Content-Type":      "application/json",
    "AuthorizationType": "ilink_bot_token",
    "X-WECHAT-UIN":      randomWechatUin(),
    "iLink-App-Id":      ILINK_APP_ID,
  };
  if (token?.trim()) {
    headers["Authorization"] = `Bearer ${token.trim()}`;
  }
  if (body != null) {
    headers["Content-Length"] = String(Buffer.byteLength(body, "utf-8"));
  }
  return headers;
}

// ── iLink API 封装 ────────────────────────────────────────────

async function ilinkGet(endpoint, timeoutMs) {
  const url = `${ILINK_BASE_URL}/${endpoint}`;
  const opts = { method: "GET", headers: getHeaders() };
  if (timeoutMs > 0) {
    opts.signal = AbortSignal.timeout(timeoutMs);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${endpoint} HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

// ── 消息收发 ──────────────────────────────────────────────────

async function getUpdates(token, baseUrl, getUpdatesBuf) {
  const url  = `${baseUrl || ILINK_BASE_URL}/ilink/bot/getupdates`;
  const body = JSON.stringify({ get_updates_buf: getUpdatesBuf || "" });
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: postHeaders(token, body),
      body,
      signal:  AbortSignal.timeout(GETUPDATES_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`getUpdates HTTP ${res.status}: ${text}`);
    return JSON.parse(text);
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      // 长轮询超时属正常，返回空响应继续轮询
      return { ret: 0, msgs: [], get_updates_buf: getUpdatesBuf };
    }
    throw e;
  }
}

async function sendWeixin(token, baseUrl, toUserId, contextToken, text) {
  const url  = `${baseUrl || ILINK_BASE_URL}/ilink/bot/sendmessage`;
  const body = JSON.stringify({
    msg: {
      to_user_id:    toUserId,
      context_token: contextToken || "",
      item_list:     [{ type: 1, text_item: { text } }],
    },
  });
  const res = await fetch(url, {
    method:  "POST",
    headers: postHeaders(token, body),
    body,
    signal:  AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const respText = await res.text();
  if (!res.ok) throw new Error(`sendMessage HTTP ${res.status}: ${respText}`);
  return JSON.parse(respText);
}

// ── 登录：QR 码流程 ───────────────────────────────────────────

async function fetchQRCode() {
  return ilinkGet(`ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`, 15_000);
}

async function pollQRStatus(qrcode, currentBaseUrl) {
  const base = currentBaseUrl || ILINK_BASE_URL;
  const url  = `${base}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
  try {
    const res = await fetch(url, {
      method:  "GET",
      headers: getHeaders(),
      signal:  AbortSignal.timeout(QR_LONG_POLL_MS),
    });
    const text = await res.text();
    return JSON.parse(text);
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") {
      return { status: "wait" };
    }
    console.warn("⚠️  QR 状态轮询网络错误，稍后重试:", e.message);
    return { status: "wait" };
  }
}

async function printQR(url) {
  try {
    const qrterm = require("qrcode-terminal");
    qrterm.generate(url, { small: true });
    console.log("如果二维码未能正常显示，请用浏览器打开以下链接扫码：");
    console.log(url);
  } catch {
    console.log("请用浏览器打开以下链接，用微信扫描页面上的二维码：");
    console.log(url);
  }
}

async function doLogin() {
  console.log("🔑 开始微信 iLink 扫码登录...\n");

  let qrData = await fetchQRCode();
  console.log("\n📱 请用微信扫描以下二维码：\n");
  await printQR(qrData.qrcode_img_content);
  console.log();

  let qrcode           = qrData.qrcode;
  let currentBaseUrl   = ILINK_BASE_URL;
  let qrRefreshCount   = 1;
  let scannedPrinted   = false;
  const deadline       = Date.now() + 8 * 60_000;

  while (Date.now() < deadline) {
    const status = await pollQRStatus(qrcode, currentBaseUrl);

    switch (status.status) {
      case "wait":
        process.stdout.write(".");
        break;

      case "scaned":
        if (!scannedPrinted) {
          process.stdout.write("\n👀 已扫码，在微信中继续确认...\n");
          scannedPrinted = true;
        }
        break;

      case "scaned_but_redirect":
        if (status.redirect_host) {
          currentBaseUrl = `https://${status.redirect_host}`;
          console.log(`\n↪️  IDC 跳转至: ${status.redirect_host}`);
        }
        break;

      case "expired": {
        qrRefreshCount++;
        if (qrRefreshCount > MAX_QR_REFRESH) {
          console.error(`\n❌ 二维码多次过期，登录失败，请重试。`);
          process.exit(1);
        }
        process.stdout.write(`\n⏳ 二维码已过期，正在刷新...(${qrRefreshCount}/${MAX_QR_REFRESH})\n`);
        qrData        = await fetchQRCode();
        qrcode        = qrData.qrcode;
        currentBaseUrl = ILINK_BASE_URL;
        scannedPrinted = false;
        console.log("\n📱 新二维码，请重新扫描：\n");
        await printQR(qrData.qrcode_img_content);
        console.log();
        break;
      }

      case "confirmed": {
        if (!status.ilink_bot_id) {
          console.error("\n❌ 登录失败：服务器未返回 ilink_bot_id。");
          process.exit(1);
        }
        const accountId = status.ilink_bot_id;
        saveAccount(accountId, {
          token:   status.bot_token,
          baseUrl: status.baseurl || "",
          userId:  status.ilink_user_id || "",
        });
        registerAccountId(accountId);
        process.stdout.write("\n");
        console.log(`✅ 登录成功！账号 ID: ${accountId}`);
        if (status.ilink_user_id) {
          console.log(`   扫码用户: ${status.ilink_user_id}`);
        }
        console.log(`\n   状态目录: ${WEIXIN_DIR}`);
        console.log(`   现在可以运行：node weixin_bridge.mjs\n`);
        return;
      }

      default:
        console.warn(`\n⚠️  未知状态: ${status.status}`);
    }

    await sleep(1000);
  }

  console.error("\n❌ 登录超时，请重试。");
  process.exit(1);
}

// ── accounts 命令 ─────────────────────────────────────────────

function doListAccounts() {
  const ids = listAccountIds();
  if (!ids.length) {
    console.log("没有已登录的微信账号。运行 node weixin_bridge.mjs login 登录。");
    return;
  }
  console.log(`已保存的账号（${ids.length} 个）：`);
  for (const id of ids) {
    const data = loadAccount(id);
    const savedAt = data?.savedAt ? `  (保存于 ${data.savedAt})` : "";
    const token   = data?.token   ? "  ✓ token 已存在" : "  ✗ token 缺失";
    console.log(`  ${id}${token}${savedAt}`);
  }
}

// ── MQTT 桥接 ─────────────────────────────────────────────────

async function doBridge() {
  // 读取账号
  let account;
  try {
    account = resolveAccount();
    console.log(`✅ 使用微信账号: ${account.accountId}`);
  } catch (e) {
    console.error("❌", e.message);
    process.exit(1);
  }

  const TOKEN    = account.token;
  const BASE_URL = account.baseUrl || ILINK_BASE_URL;
  let defaultTarget = extractLatestTarget(account);

  const bridgeConfig = loadBridgeConfig(process.env);
  let client = null;
  let topicIn = "";

  if (bridgeConfig.mode === "mqtt") {
    let mqtt;
    try {
      mqtt = require("mqtt");
    } catch {
      console.error("❌ 缺少 mqtt 包，请先运行：npm install mqtt");
      process.exit(1);
    }

    if (!bridgeConfig.mqttUri) {
      console.error("❌ 请设置环境变量 MQTT_URI，例如：");
      console.error("   export MQTT_URI=mqtts://xxxx.emqxsl.cn:8883");
      process.exit(1);
    }

    topicIn = `${bridgeConfig.mqttTopic}/in`;
    const topicOut = `${bridgeConfig.mqttTopic}/out`;

    const mqttOpts = {
      ...(bridgeConfig.mqttUser && { username: bridgeConfig.mqttUser }),
      ...(bridgeConfig.mqttPass && { password: bridgeConfig.mqttPass }),
      reconnectPeriod: 5000,
      connectTimeout:  10000,
    };

    client = mqtt.connect(bridgeConfig.mqttUri, mqttOpts);

    client.on("connect", () => {
      console.log(`✅ MQTT 已连接: ${bridgeConfig.mqttUri}`);
      client.subscribe(topicOut, { qos: 1 }, (err) => {
        if (err) console.error("订阅失败:", err);
        else     console.log(`📡 订阅: ${topicOut}`);
      });
    });
    client.on("error",      (e) => console.error("MQTT 错误:", e.message));
    client.on("disconnect", ()  => console.log("MQTT 断开"));

    // zclaw 回复 → 微信
    client.on("message", async (topic, payload) => {
      if (topic !== topicOut) return;
      let msg;
      try { msg = JSON.parse(payload.toString()); } catch { return; }

      const { text, user_id, ctx } = msg;
      if (!text) return;

      let targetUserId = user_id?.trim() || "";
      let targetCtx = ctx?.trim() || "";
      if (!targetUserId) {
        defaultTarget = defaultTarget || extractLatestTarget(loadAccount(account.accountId));
        if (!defaultTarget?.userId) {
          console.error("发送微信消息失败: 未找到默认联系人，请先给 bot 发一条消息完成绑定");
          return;
        }
        targetUserId = defaultTarget.userId;
        if (!targetCtx) {
          targetCtx = defaultTarget.contextToken || "";
        }
      }

      console.log(`→ 微信 [${targetUserId}]: ${text.slice(0, 80)}`);
      try {
        await sendWeixin(TOKEN, BASE_URL, targetUserId, targetCtx, text);
      } catch (e) {
        console.error("发送微信消息失败:", e.message);
      }
    });
  } else {
    console.log(`✅ 使用 relay 模式: ${bridgeConfig.relayUrl}`);
  }

  // 微信长轮询 → MQTT
  const syncFile = path.join(ACCOUNTS_DIR, `${account.accountId}.sync.json`);
  let getUpdatesBuf = "";
  try {
    const saved = JSON.parse(fs.readFileSync(syncFile, "utf-8"));
    if (saved?.get_updates_buf) {
      getUpdatesBuf = saved.get_updates_buf;
      console.log("↩️  恢复同步游标");
    }
  } catch { /* 首次启动 */ }

  console.log("🔄 开始微信长轮询...");

  while (true) {
    let data;
    try {
      data = await getUpdates(TOKEN, BASE_URL, getUpdatesBuf);
    } catch (e) {
      console.error("getUpdates 失败:", e.message);
      await sleep(5000);
      continue;
    }

    const looksLikeSuccess =
      (typeof data?.ret === "number" && data.ret === 0) ||
      Array.isArray(data?.msgs) ||
      typeof data?.get_updates_buf === "string";

    if (!looksLikeSuccess) {
      if (data?.errcode === -14) {
        // 会话超时，清空游标重试
        console.warn("⚠️  会话超时，重置同步游标");
        getUpdatesBuf = "";
      } else {
        console.error("getUpdates 错误:", data?.errcode, data?.errmsg, data);
        await sleep(5000);
      }
      continue;
    }

    if (data.get_updates_buf) {
      getUpdatesBuf = data.get_updates_buf;
      try {
        fs.writeFileSync(syncFile, JSON.stringify({ get_updates_buf: getUpdatesBuf }, null, 2));
      } catch { /* 忽略 */ }
    }

    for (const wxMsg of (data.msgs || [])) {
      // 只处理用户发来的文本消息
      if (wxMsg.message_type !== 1) continue;
      const textItem = wxMsg.item_list?.find(i => i.type === 1)?.text_item;
      if (!textItem?.text) continue;

      const text   = textItem.text.trim();
      const userId = wxMsg.from_user_id || "";
      const ctx    = wxMsg.context_token || "";

      if (!text || !userId) continue;

      console.log(`← 微信 [${userId}]: ${text.slice(0, 80)}`);
      if (saveLatestTarget(account.accountId, userId, ctx)) {
        defaultTarget = { userId, contextToken: ctx || "" };
        console.log(`🎯 已更新默认联系人: ${userId}`);
      } else {
        defaultTarget = { userId, contextToken: ctx || "" };
      }

      if (bridgeConfig.mode === "mqtt") {
        const payload = JSON.stringify({ text, user_id: userId, ctx });
        client.publish(topicIn, payload, { qos: 1 });
        continue;
      }

      try {
        const reply = await relayChat({
          relayUrl: bridgeConfig.relayUrl,
          relayApiKey: bridgeConfig.relayApiKey,
          message: text,
        });
        console.log(`→ 微信 [${userId}]: ${reply.slice(0, 80)}`);
        await sendWeixin(TOKEN, BASE_URL, userId, ctx, reply);
      } catch (e) {
        console.error("relay 请求失败:", e.message);
      }
    }
  }
}

// ── 工具 ──────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 入口 ──────────────────────────────────────────────────────

const cmd = process.argv[2] || "bridge";

switch (cmd) {
  case "login":
    doLogin().catch(e => { console.error("登录失败:", e); process.exit(1); });
    break;

  case "accounts":
    doListAccounts();
    break;

  case "bridge":
  default:
    doBridge().catch(e => { console.error("桥接崩溃:", e); process.exit(1); });
    break;
}
