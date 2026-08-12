# Plum Google OAuth 配置

## Google Cloud

1. 在 Google Cloud Console 创建或选择项目，配置 OAuth consent screen。
2. 应用类型选择 **Web application**，Scopes 仅申请 `openid`、`email`、`profile`。
3. 本地调试先将账号加入 Test users，保持应用处于 Testing 状态。
4. 创建 OAuth Client ID，并添加与服务端逐字符一致的 Authorized redirect URI：

   - 本地：`http://localhost:3000/auth/google/callback`
   - 生产：使用实际 Plum HTTPS 域名的 `/auth/google/callback` 路径。

## 服务端环境变量

```text
PLUM_GOOGLE_AUTH_ENABLED=true
PLUM_GOOGLE_CLIENT_ID=...
PLUM_GOOGLE_CLIENT_SECRET=...
PLUM_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
PLUM_OAUTH_STATE_PEPPER=<至少32字节随机值>
```

Client secret 只能放在后端 secret manager/环境变量中，不要放入前端、`NEXT_PUBLIC_*`、Git 或日志。Google 登录使用 Authorization Code + PKCE；服务端会校验 state、nonce、JWKS 签名、issuer、audience、有效期和 `email_verified`。

生产切换前确认域名已完成 Google 验证，并将 consent screen 从 Testing 发布到合适状态。OAuth callback 的 redirect URI 必须与 Google Cloud 和 `PLUM_GOOGLE_REDIRECT_URI` 完全一致。
