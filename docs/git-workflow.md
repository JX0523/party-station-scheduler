# Git 工作流与部署流程

> 本文档说明本项目的 git 使用约定、提交推送流程、自动部署机制和回滚方法。
> 写给：开发同学（含未来接手的人）和想了解「代码是怎么上线」的管理员。

## 1. 仓库与分支

- 远程仓库：`https://github.com/JX0523/party-station-scheduler.git`（公开）
- 唯一长期分支：**master**（没有 develop/feature 分支，单人/小团队项目）
- 本地提交后直接推送 master，推送即触发自动部署

## 2. 日常流程（三句话）

```bash
git add -A                    # 1. 暂存所有改动
git commit -m "说明这次改了什么"  # 2. 提交（消息写清楚，中文即可）
git push origin master        # 3. 推送（自动触发部署）
```

## 3. 提交消息规范

用一句话说清「改了什么 + 为什么」，参考历史提交：

```
修复排班系统9项缺陷+功能补全：补排生效/紧急模式/时段0语义/maxPerWeek/唯一约束/注册开关等；新增回归测试与文档
修复Supabase保活：每周2次ping（周日+周三），防止7天不活跃被暂停
修复Netlify SPA路由：添加_redirects到public目录 + 部署脚本复制netlify.toml
```

约定：`类型 + 主题`，类型常用词：修复 / 新增 / 优化 / 文档 / 加固 / 重构。

## 4. 推送后自动发生什么

推送 master 后，GitHub Actions 执行 `.github/workflows/deploy.yml`（两个并行 job）：

| Job | 做什么 | 产物地址 |
|-----|--------|---------|
| deploy-github-pages | `npm ci` + `npm run build`（base=/party-station-scheduler/）+ 上传 Pages artifact + 部署 | https://JX0523.github.io/party-station-scheduler/ |
| deploy-netlify | `npm ci` + `npm run build`（base=/）+ 复制 netlify.toml + 部署 | https://creative-brioche-5681d2.netlify.app |

另有 `.github/workflows/keep-alive.yml`：每周三、周日自动 ping 一次 Supabase REST 接口，
防止免费项目因 7 天不活跃被暂停（项目曾因此被暂停过一次，见 dev-logs/2026-08-10.md）。

### 部署需要的 Secrets（仓库 Settings → Secrets and variables → Actions）

```
VITE_SUPABASE_URL      # Supabase 项目 URL
VITE_SUPABASE_ANON_KEY # 公开密钥（anon/publishable）
NETLIFY_AUTH_TOKEN     # Netlify 个人令牌
NETLIFY_SITE_ID        # Netlify 站点 ID
```

## 5. 如何查看部署是否成功

方法一（推荐）：仓库页面 → **Actions** 标签 → 最新一次 Deploy 运行 →
绿色 ✓ = 成功，红色 ✗ = 失败（点进去看哪一步报错）。

方法二（命令行）：

```bash
curl https://api.github.com/repos/JX0523/party-station-scheduler/actions/runs?per_page=1
# 看 status=completed 且 conclusion=success
```

方法三：直接访问两个网址，能打开且是新功能即部署成功。

## 6. 出问题了怎么办

### 部署失败
- 常见失败原因：`.env.example` 和 Secrets 不一致、Supabase 项目被暂停（keep-alive 兜底）、
  Netlify 令牌过期。点开失败 run 的日志看具体步骤。

### 上线后发现问题想回滚

```bash
# 回滚到上一个正常提交（例如 d6c3a41 之前的 af9aae8）
git revert af9aae8 --no-edit   # 生成一个反向提交（推荐，保留历史）
git push origin master          # 推送后自动重新部署

# 或者：直接推送旧版本（不推荐，会丢历史）
git reset --hard af9aae8 && git push -f origin master
```

### 本地误操作（还没推送）

```bash
git status                     # 看改了什么
git checkout -- 文件名          # 丢弃某个文件的改动
git log --oneline -5            # 看最近提交
```

## 7. 数据库迁移怎么走（重要）

**git 只管代码，数据库结构要单独在 Supabase 执行**：

1. 新建迁移文件：`database/migration-vX-描述.sql`（同时更新 `database/schema.sql`）
2. 在 Supabase 后台 → SQL Editor → 粘贴执行
3. 在 `docs/tech-spec.md` 第 7 节变更记录登记
4. 在 `CHANGELOG.md` 记录

> 已执行的历史迁移：migration-v4-assignments-unique.sql（2026-08-14，已生效并验证）。

## 8. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-14 | 首次编写本文档；同日完成 9 项修复、迁移执行、commit d6c3a41 部署上线 |