# 贡献指南

感谢你愿意改进 Work Calendar。为了让改动更容易被审阅和合入，请遵循以下约定。

## 开始之前

- 对于较大的功能或行为变更，建议先开一个 Issue 说明背景和目标，确认方向后再动手。
- 对于缺陷修复，请尽量在 Issue 中附上复现步骤、期望行为与实际行为。
- 不要提交任何真实的账户文件、数据库、API Key 或 Tunnel 凭证。

## 开发环境

- Python 3.11+（无第三方依赖）
- Node.js 18+（仅用于前端测试）
- Windows 额外需要：`python -m pip install tzdata`

启动本地服务：

```bash
./run.sh
# Windows: .\run-windows.ps1
```

## 提交前检查

请确保两套测试都通过：

```bash
python -m unittest discover -s tests -p "test_*.py"
node --test tests/calendar.test.cjs
```

- 后端行为改动应在 `tests/` 中补充或更新用例。
- 前端可见范围、日期边界或状态流转的改动应在 `tests/calendar.test.cjs` 中覆盖。
- 保持现有代码风格；本项目刻意保持单文件服务与零运行时依赖，请勿为此引入框架或构建链。

## 提交信息

采用简洁的祈使句标题，必要时在正文说明动机与影响，例如：

```
修复递延任务跨周后日期错位

- 归一化跨周计算使用的周起点
- 补充跨年场景回归用例
```

## Pull Request

- 一个 PR 聚焦一件事，避免混入无关格式化或重构。
- 在描述中说明改动内容、验证方式（跑了哪些测试）以及是否有破坏性变更。
- 涉及界面改动的，建议附上截图或简短录屏。

## 许可证

提交贡献即表示你同意以本项目的 [MIT License](../LICENSE) 授权你的改动。
