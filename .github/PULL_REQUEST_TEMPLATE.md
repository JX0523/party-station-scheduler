## 这个 PR 做了什么

（一句话说明改动内容）

## 为什么

（解决的问题 / 关联 Issue，如 `Closes #12`）

## 怎么验证

（复现步骤或测试命令，例如：`node test-holiday-dates.mjs`）

## 自查清单

- [ ] 全部测试通过（`Get-ChildItem test-*.mjs | ForEach-Object { node $_ }`）
- [ ] `npm run build` 成功
- [ ] `npm run lint` 无 error
- [ ] 新增行为已补测试
- [ ] 数据库改动附了迁移 SQL（**新表必须带 GRANT**）
- [ ] 已更新 `CHANGELOG.md` 及相关文档
- [ ] 没有提交 `.env`、个人数据备份等敏感文件

## 截图（如有界面改动）
