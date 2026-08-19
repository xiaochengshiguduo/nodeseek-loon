/******************************
脚本名称: NodeSeek (Loon 移植版)
原版    : Egern 模块 (github.com/Nullwhy/Egern)
原脚本  : @Curtinp118 / @Nullwhy
功能    : Cookie 捕获 + 每日自动签到
使用说明:
1. Loon 添加插件后，安装根证书并开启 MITM
2. 保持已登录 nodeseek.com，打开个人中心页面触发一次 Cookie 捕获
3. 之后每天按插件「签到时间」配置项自动签到
4. 固定 5 鸡腿：插件「固定 5 鸡腿」开关打开（不依赖脚本修改）
*******************************/

const SCRIPT_NAME = "NodeSeek🎉";
const STORE_KEY = "nodeseek_headers";
const ATTEND_BASE = "https://www.nodeseek.com/api/attendance";

// 读取插件配置项：固定鸡腿开关（Loon [Argument] 传入，兼容无参数环境，默认随机）
function argFixedLegs() {
  try {
    const v = (typeof $argument !== "undefined" && $argument) ? $argument.fixedLegs : undefined;
    if (v == null || String(v).trim() === "") return false;
    return ["1", "true", "yes", "on"].indexOf(String(v).trim().toLowerCase()) !== -1;
  } catch (e) {
    return false;
  }
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
  for (let i = 0; i < HEADER_KEYS.length; i++) {
    const key = HEADER_KEYS[i];
    const value = headerValue(src || {}, key);
    if (value) saved[key] = value;
  }
  return saved;
}

function buildAttendHeaders(saved) {
  const headers = {};
  for (let i = 0; i < HEADER_KEYS.length; i++) {
    const key = HEADER_KEYS[i];
    headers[key] = (saved && saved[key]) || DEFAULT_HEADERS[key];
  }
  return headers;
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

  $httpClient.post({
    url: ATTEND_BASE + "?random=" + (fixed ? "false" : "true"),
    headers: buildAttendHeaders(saved),
    body: "",
    timeout: 10000
  }, function (error, response, data) {
    if (error || !response) {
      notify("网络错误", "请检查网络连接");
      log(error && error.message ? error.message : String(error));
      $done();
      return;
    }
    const status = response.status;
    let message = "";
    try { message = (JSON.parse(data) || {}).message || ""; } catch (e) {}

    const modeTag = fixed ? "固定" : "随机";
    if (status === 403) {
      notify("被风控", "403，稍后重试");
    } else if (status === 500) {
      notify("服务器错误", "500");
    } else if (status >= 200 && status < 300) {
      notify("签到成功（" + modeTag + "）", message || "签到完成");
    } else {
      notify("请求异常", "HTTP " + status);
    }
    $done();
  });
}

// ---------- Cookie 捕获（http-response 触发） ----------
function captureHeaders() {
  const saved = pickHeaders(($request && $request.headers) || {});

  // 未捕获到 Cookie 视为未登录，不覆盖已有数据
  if (!saved["Cookie"]) {
    notify("Cookie 失败", "未捕获到 Cookie，请确认已登录并访问个人中心页");
    $done({ response: $response });
    return;
  }

  $persistentStore.write(JSON.stringify(saved), STORE_KEY);
  log("请求头已保存，共 " + Object.keys(saved).length + " 个字段");
  notify("Cookie 成功", "请求头已保存，可以正常签到了");
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