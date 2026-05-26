# 工商银行如意积存金走势

这是一个用于查看工商银行如意积存金报价走势的小页面，并在买入价低于阈值时通过飞书机器人发送提醒。

## 功能

- 拉取 ICBC `A00505` 报价
- 页面展示买入价、卖出价和走势图
- 当买入价低于 `999` 时，自动发送飞书机器人消息
- 通过本地状态文件避免重复刷屏

## 配置飞书机器人

在运行 `api/quote.php` 的环境中设置以下环境变量：

- `FEISHU_BOT_WEBHOOK`：飞书自定义机器人 Webhook 地址
- `FEISHU_BOT_SECRET`：可选，机器人安全设置里的签名密钥
- `BUY_ALERT_THRESHOLD`：可选，默认 `999`
- `BUY_ALERT_STATE_FILE`：可选，提醒状态文件路径，默认 `api/.feishu-buy-alert-state.json`
- `ICBC_OPENSSL_CONF`：可选，ICBC 请求使用的 OpenSSL 配置文件路径，默认 `api/openssl.cnf`

## 提醒规则

- 当前 `buy` 低于阈值且此前未处于低于阈值状态时，发送一次提醒
- 当 `buy` 回到阈值以上后，会自动重置状态，下一次跌破时会再次提醒

## 说明

前端会定时请求 `api/quote.php`，所以提醒逻辑放在接口里，页面打开后会自动生效。

