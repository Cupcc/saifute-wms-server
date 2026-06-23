# 部署与运维 Playbook（Mac mini 内网单机）

赛福特 WMS 当前生产部署的权威运维手册。一个 Bun 进程在 **`:90`** 上同时伏服前端页面和后端 API,由 macOS launchd 开机自启动,供局域网使用。

> 本文件是版本受控的权威副本;部署目录 `/Users/sft/Projects/saifute-wms-deploy/运维手册.md` 有一份随部署同步的拷贝,内容应与此一致。

---

## 1. 基本信息

| 项 | 值 |
|----|----|
| 访问地址 | `http://<本机内网IP>:90` |
| 服务标识(label) | `com.saifute.wms` |
| 自启动配置 | `~/Library/LaunchAgents/com.saifute.wms.plist`(部署目录有副本) |
| 工作目录 | `/Users/sft/Projects/saifute-wms-deploy` |
| 启动命令 | `bun --env-file .env.prod dist/src/main.js` |
| 端口 | `90`(由 `.env.prod` 的 `PORT` 决定) |
| 数据库 / Redis | 复用 `.env.dev` 同一套(同机,未做迁移) |
| 源码工程 | `/Users/sft/Projects/saifute-wms-server-nestjs-fix` |

### 部署目录结构

```text
saifute-wms-deploy/
├── dist/                  # 后端编译产物
├── generated/             # Prisma Client
├── node_modules/          # 运行时依赖
├── web/dist/              # 前端构建产物（同源伏服）
├── .env.prod              # 生产配置（权限 600，含密码，勿外传）
├── storage/               # 上传文件 + 数据库备份(database-backups/)
├── logs/                  # 运行日志 + launchd.out.log / launchd.err.log
├── com.saifute.wms.plist  # 自启动配置副本
├── redeploy.sh            # 一键重新部署脚本
└── 运维手册.md            # 随部署的运维手册副本
```

---

## 2. 架构要点（为什么是这套）

- **单进程同源,无 Nginx**:后端用 NestExpress 直接伏服 `web/dist`(`src/bootstrap/web-app-static-assets.ts`),并对 history 路由回退 `index.html`,放行 `/api` 与 `/profile` 前缀。前端 `web/.env.production` 的 `VITE_APP_BASE_API=''`(空),因为前端 API URL 自带 `/api` 前缀,同源下 `/api/...`、`/profile/...` 直接命中后端,省掉反向代理重写。
- **前端伏服路径**:后端配置 `WEB_DIST_PATH`(默认 `web/dist`,相对工作目录)。
- **独立部署目录**:运行环境只含产物,不含源码,改不动业务代码。

---

## 3. 日常运维命令

```bash
# 重启（杀掉当前实例并重新拉起）
launchctl kickstart -k gui/$(id -u)/com.saifute.wms

# 停止
launchctl bootout gui/$(id -u)/com.saifute.wms

# 启动（停止后再起，或首次装载）
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.saifute.wms.plist

# 看状态 / pid / 最后退出码
launchctl print gui/$(id -u)/com.saifute.wms | grep -E "state =|pid =|last exit"

# 看实时日志
tail -f /Users/sft/Projects/saifute-wms-deploy/logs/launchd.out.log
tail -f /Users/sft/Projects/saifute-wms-deploy/logs/launchd.err.log
```

### 健康检查

```bash
lsof -nP -iTCP:90 -sTCP:LISTEN
curl -s -o /dev/null -w "前端 / → %{http_code}\n" http://127.0.0.1:90/
curl -s -o /dev/null -w "API   → %{http_code}\n" http://127.0.0.1:90/api/auth/captcha
```
两个都 `200` 即正常。

---

## 4. 改端口

```bash
# 1. 确认新端口未占用（换非 90 端口时）
lsof -nP -iTCP:<新端口> -sTCP:LISTEN

# 2. 改部署目录的 .env.prod（运行时生效的那份）+ 源码工程那份保持一致
sed -i '' 's/^PORT=.*/PORT=<新端口>/' /Users/sft/Projects/saifute-wms-deploy/.env.prod
sed -i '' 's/^PORT=.*/PORT=<新端口>/' /Users/sft/Projects/saifute-wms-server-nestjs-fix/.env.prod

# 3. 重启
launchctl kickstart -k gui/$(id -u)/com.saifute.wms
```

> 本机 macOS 允许当前用户绑定 `<1024` 端口(如 90),无需 sudo。
> 前端同源(base 为空),改端口**不需要重建前端**。

---

## 5. 重新部署（改了代码之后）

```bash
cd /Users/sft/Projects/saifute-wms-deploy && bash redeploy.sh
```

脚本流程:在源码工程构建前后端 → rsync 同步 `dist/`、`generated/`、`node_modules/`、`web/dist/` 到部署目录 → 重启 → 健康检查。
**不动** `.env.prod` / `storage/` / `logs/`。改了路径就编辑 `redeploy.sh` 顶部 `SRC` / `DEP`。

---

## 6. 数据库与备份

- 运行库和 Redis 复用 `.env.dev` 同一套(`DATABASE_URL` / `REDIS_DB=0`)。
- 调度器开启(`SCHEDULER_ENABLED=true`),自动用 `mysqldump` 备份到 `storage/database-backups/`,保留最近 `DATABASE_BACKUP_RETENTION_FULL_COUNT`(默认 2)份。
- `mysqldump` 由 plist 的 `PATH`(含 `/opt/homebrew/bin`)提供;换机或 brew 路径变化要同步改 plist。

> ⚠️ 生产与开发共用同一个库,**不要在本机跑任何会清库/重灌的开发脚本**。

---

## 7. 排障

| 现象 | 排查 |
|------|------|
| 访问不了 | `launchctl print ... \| grep state`;看 `logs/launchd.err.log` |
| 一直重启(crash loop) | 看 `logs/launchd.err.log` 末尾;常见:端口被占、DB/Redis 连不上、`.env.prod` 配错 |
| 端口被占 | `lsof -nP -iTCP:90 -sTCP:LISTEN`;注意别再跑 `bun run dev:web`(vite 也默认抢 90) |
| 改了配置不生效 | 确认改的是**部署目录**的 `.env.prod`,且执行了 `kickstart -k` |
| 前端白屏 / 接口 404 | 确认 `web/dist/` 已同步、`VITE_APP_BASE_API` 为空、重新 `bash redeploy.sh` |

---

## 8. 注意事项

- **开机自启动前提是用户登录**:LaunchAgent 在用户登录后加载。要通电即起,需在「系统设置 → 用户与群组 → 自动登录」开启该用户自动登录。
- `.env.prod` 含明文数据库密码和 JWT 密钥,权限保持 `600`,不要提交 git、不要外发。
- 生产跑编译产物,与源码 git 分支无关;但 `redeploy.sh` 会取源码工程最新代码,部署前确认其在预期分支。
- 部署目录是运行环境,**不要在此改源码**,下次 `redeploy.sh` 会覆盖。
