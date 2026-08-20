/******************************
脚本名称: NodeSeek (Loon 移植版)
原版    : Egern 模块 (github.com/Nullwhy/Egern)
原脚本  : @Curtinp118 / @Nullwhy
功能    : Cookie 捕获 + 每日自动签到
使用说明:
1. Loon 添加插件后，安装根证书并开启 MITM
2. 打开配置项「启用 Cookie 捕获」，访问 nodeseek 个人中心页捕获请求头，成功后关闭开关
3. 之后每天按「每日签到时间」自动签到（签到无需捕获开关保持开启）
4. 固定 5 鸡腿：打开配置项「固定 5 鸡腿」开关
5. 排障：打开「开启日志」开关，在 Loon 脚本控制台查看详细输出
*******************************/

const SCRIPT_NAME = "NodeSeek🎉";
const STORE_KEY = "nodeseek_headers";
const ATTEND_BASE = "https://www.nodeseek.com/api/attendance";

// 读取插件配置开关（Loon [Argument] 传入，兼容无参数环境，默认 false）
function argSwitch(key) {
  try {
    const v = (typeof $argument !== "undefined" && $argument) ? $argument[key] : undefined;
    if (v == null || String(v).trim() === "") return false;
    return ["1", "true", "yes", "on"].indexOf(String(v).trim().toLowerCase()) !== -1;
  } catch (e) {
    return false;
  }
}
// 固定鸡腿开关（默认随机）
function argFixedLegs() { return argSwitch("fixedLegs"); }
// 日志开关（默认关闭，开启后输出详细日志到 Loon 控制台）
function argLogEnabled() { return argSwitch("enableLog"); }

// 捕获状态记录：STORE_KEY 存请求头，STATE_KEY 存 "ok|<cookie指纹>" 或 "fail|"（用于去重通知）
// 状态键升级：完整请求头版本首次运行时强制重新捕获一次
const STATE_KEY = "nodeseek_capture_state_v2";

// djb2 指纹，用于判断 Cookie 是否变化（变化才保存/提示，避免每次打开页面都通知）
function fp(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

// 捕获时按此列表挑字段；签到时用同表默认值补全
const DEFAULT_HEADERS = {
  Connection: "keep-alive",
  "Accept-Encoding": "gzip, deflate, br",
  Priority: "u=3, i",
  "Content-Type": "text/plain;charset=UTF-8",
  Origin: "https://www.nodeseek.com",
  "refract-sign": "",
  "User-Agent": "Mozilla/5.0",
  "refract-key": "",
  "Sec-Fetch-Mode": "cors",
  Cookie: "",
  Host: "www.nodeseek.com",
  Referer: "https://www.nodeseek.com/",
  "Accept-Language": "zh-CN,zh-Hans;q=0.9",
  Accept: "*/*"
};
const HEADER_KEYS = Object.keys(DEFAULT_HEADERS);

function log(msg) {
  if (!argLogEnabled()) return;
  const line = "[" + SCRIPT_NAME + "] " + msg;
  try { console.log(line); } catch (e) {}
  if (typeof $log !== "undefined") { try { $log(line); } catch (e) {} }
}

function notify(subtitle, body) {
  log(subtitle + ": " + body);
  if (typeof $notification !== "undefined" && $notification.post) {
    $notification.post(SCRIPT_NAME, subtitle, body);
  }
}

function headerValue(src, key) {
  return src[key] || src[key.toLowerCase()] || src[key.toUpperCase()] || "";
}

function pickHeaders(src) {
  const saved = {};
  const input = src || {};
  const keys = Object.keys(input);
  // Loon 3.5/Cloudflare 可能新增 sec-*、sec-ch-* 等头，不能只保存固定白名单。
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = input[key];
    if (value != null && String(value) !== "" &&
        !/^(content-length|proxy-|upgrade|te|trailer)$/i.test(key)) {
      saved[key] = value;
    }
  }
  // 兼容某些运行环境大小写异常：补齐签到所需的标准字段。
  for (let j = 0; j < HEADER_KEYS.length; j++) {
    const key = HEADER_KEYS[j];
    const value = headerValue(input, key);
    if (value && !saved[key]) saved[key] = value;
  }
  return saved;
}

function buildAttendHeaders(saved) {
  const headers = {};
  const source = saved || {};
  const keys = Object.keys(source);
  // 原样复用捕获到的全部业务请求头，避免丢失 Cloudflare/浏览器特征。
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (/^(content-length|proxy-|upgrade|te|trailer)$/i.test(key)) continue;
    headers[key] = source[key];
  }
  // 仅对捕获请求中不存在的核心字段使用默认值。
  for (let j = 0; j < HEADER_KEYS.length; j++) {
    const key = HEADER_KEYS[j];
    if (!headerValue(headers, key) && DEFAULT_HEADERS[key]) headers[key] = DEFAULT_HEADERS[key];
  }
  return headers;
}

function responseSnippet(data) {
  if (data == null) return "";
  return String(data).replace(/\s+/g, " ").slice(0, 180);
}

function postAttendance(url, headers, callback) {
  $httpClient.post({ url: url, headers: headers, body: "", timeout: 10000 }, callback);
}


// ---------- 定时签到（cron 触发，无 $response） ----------
function doCheckIn() {
  const fixed = argFixedLegs();
  log("开始执行签到任务（" + (fixed ? "固定鸡腿" : "随机鸡腿") + "）");

  let raw = null;
  try { raw = $persistentStore.read(STORE_KEY); } catch (e) {}

  if (!raw) {
    notify("缺少请求头", "请先登录 nodeseek 并打开个人页面捕获 Cookie");
    return;
  }

  let saved;
  try {
    saved = JSON.parse(raw);
  } catch (e) {
    notify("数据异常", "请重新打开个人页面刷新 Cookie");
    return;
  }

  const url = ATTEND_BASE + "?random=" + (fixed ? "false" : "true");
  const headers = buildAttendHeaders(saved);
  postAttendance(url, headers, function (error, response, data) {
    if (error || !response) {
      notify("网络错误", "请检查网络连接");
      log(error && error.message ? error.message : String(error));
      $done();
      return;
    }
    const status = response.status || response.statusCode;
    let message = "";
    try { message = (JSON.parse(data) || {}).message || ""; } catch (e) {}

    const modeTag = fixed ? "固定" : "随机";
    if (status === 403) {
      log("403 响应：" + responseSnippet(data));
      notify("被风控", "403，Cookie/UA/IP 可能不匹配；请重新捕获后重试");
    } else if (status === 500) {
      notify("服务器错误", "500");
    } else if (status >= 200 && status < 300) {
      notify("签到成功（" + modeTag + "）", message || "签到完成");
    } else {
      log("HTTP " + status + " 响应：" + responseSnippet(data));
      notify("请求异常", "HTTP " + status);
    }
    $done();
  });
}

// 解析 getInfo 响应体判断登录状态："in" / "out" / "unknown"
function judgeLogin(body) {
  let b = null;
  try { b = body ? JSON.parse(body) : null; } catch (e) {}
  if (!b || typeof b !== "object") return "unknown";
  const uid = b.uid != null ? b.uid : (b._uid != null ? b._uid : (b.user ? b.user.uid : undefined));
  const uname = b.username || (b.user && b.user.username) || b.name || b.nickname;
  if (b.isLoggedIn === true || (typeof uid === "number" && uid > 0) ||
      (typeof uid === "string" && uid !== "0" && /^\d+$/.test(uid) && parseInt(uid, 10) > 0) ||
      (uname && String(uname).trim() && !/^(guest|游客|访客)$/i.test(String(uname).trim()))) {
    return "in";
  }
  if (b.isLoggedIn === false || uid === 0 || uid === "0" || b.status === 401 || b.status === 403 ||
      /not[- ]?logged|未登录|please log|login required|sign in/i.test(JSON.stringify(b).slice(0, 300))) {
    return "out";
  }
  return "unknown";
}

function captureHeaders() {
  const reqHeaders = ($request && $request.headers) || {};
  const saved = pickHeaders(reqHeaders);
  const cookieVal = saved["Cookie"] || "";
  let state = "";
  try { state = $persistentStore.read(STATE_KEY) || ""; } catch (e) {}

  // 1. 登录状态：优先看响应体，解析失败再退回 Cookie 启发式
  let verdict = "unknown";
  try {
    verdict = judgeLogin($response && $response.body);
  } catch (e) {}
  if (verdict === "unknown" && /_uid=(0|%3A0)(;|$)/i.test(cookieVal)) verdict = "out";

  // 2. 未登录：不覆盖已有请求头；状态从 ok→fail 转换时提示一次，之后静默
  if (verdict === "out") {
    if (state.indexOf("fail") !== 0) {
      notify("Cookie 失败", "未检测到登录状态，未覆盖已有请求头");
    }
    $persistentStore.write("fail|", STATE_KEY);
    log("未登录，跳过保存");
    $done({ response: $response });
    return;
  }

  // 3. 判定为已登录但没有 Cookie（异常情况）：跳过，不打扰
  if (verdict === "in" && !cookieVal) {
    log("判定已登录但未捕获到 Cookie，跳过保存");
    $done({ response: $response });
    return;
  }

  // 4. 有 Cookie（已登录或无法判定）→ 去重：指纹没变就不保存不通知
  if (cookieVal) {
    const fpNow = fp(cookieVal);
    if (state === "ok|" + fpNow) {
      log("请求头未变化，跳过保存");
      $done({ response: $response });
      return;
    }
    $persistentStore.write(JSON.stringify(saved), STORE_KEY);
    $persistentStore.write("ok|" + fpNow, STATE_KEY);
    log("请求头已保存，共 " + Object.keys(saved).length + " 个字段");
    notify("Cookie 成功", "请求头已保存，可以正常签到了");
    $done({ response: $response });
    return;
  }

  // 5. 无法判定且没有任何 Cookie：静默跳过（可能是首次访问或纯匿名流量）
  log("未捕获到 Cookie（无法判定登录态），跳过保存");
  $done({ response: $response });
}

// ---------- 入口 ----------
function main() {
  if (typeof $response !== "undefined" && $response) {
    captureHeaders();
  } else {
    doCheckIn();
  }
}

main();