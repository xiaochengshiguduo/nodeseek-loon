# NodeSeek (Loon 插件)

NodeSeek（nodeseek.com）每日自动签到插件，由 Egern 模块移植而来。

## 导入方式

Loon → 配置 → 插件 → 添加，粘贴：

```
https://raw.githubusercontent.com/xiaochengshiguduo/nodeseek-loon/main/NodeSeek.plugin
```

## 使用步骤

1. 安装插件后，在 Loon 设置中安装根证书并开启 MITM
2. 保持已登录 nodeseek.com，打开个人中心页面触发一次 Cookie 捕获
   （收到「Cookie 成功」通知即成功）
3. 之后每天按插件配置的「签到时间」自动签到，结果通过通知推送

## 配置项（Loon 3.2.1+）

| 配置项 | 默认值 | 说明 |
|---|---|---|
| 固定 5 鸡腿 | 关 | 开启=固定 5 鸡腿，关闭=随机鸡腿 |
| 每日签到时间 | `0 10 * * *` | 5 段 cron：分 时 日 月 周 |

## 文件

- `NodeSeek.plugin` — Loon 插件（壳：MITM + 触发规则 + 配置项）
- `NodeSeek.loon.js` — 脚本（Cookie 捕获 + 签到逻辑）

## 致谢

原模块：[Nullwhy/Egern](https://github.com/Nullwhy/Egern) 的 `Rewrite/NodeSeek.module`，原作者 @Curtinp118 / @Nullwhy。