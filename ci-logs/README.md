# ci-logs

只放**最近一次 CI 失败的日志**（由 .github/workflows/ci.yml 自动写入并推送）。

- 为什么放仓库里：本机 DSH 读不到 GitHub 网页/接口，只能通过 `git fetch` 拿到失败细节。
- 文件名固定 `last-failure.txt`；CI 通过时不会产生新文件。
- 排查完可删，下次失败会重新生成。

> 2026-11-13：靠它定位到真实原因——CI 用占位 `.env`（`demo-project` 带连字符），
> 而测试里的正则只认 `[a-z0-9]`，导致管理面板相关断言全部失败。已修复。