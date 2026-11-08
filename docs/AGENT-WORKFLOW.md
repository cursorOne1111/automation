# Agent + Skill 工作流详解

## 1. 谁做决策，谁执行测试

本项目使用现有编码 Agent 的推理、文件和命令工具，不另造 LLM SDK。`tools/agent_runner.py` 是任务派发、过程记录和验证控制器，Codex CLI 才是实际的 Agent 运行时。模型由当前 Codex 配置决定，脚本未硬编码模型名称，也不需要单独配置框架 API key。

调用器分四个阶段：

| role | Skill选择 | 模型文件权限 | 产物 |
|---|---|---|---|
| plan | Web/App规划 | read-only | 任务包 result.md 中的测试计划 |
| generate | Web UI / API / App生成 | workspace-write | 用例或页面对象变更与验证记录 |
| diagnose | 失败诊断 | read-only | 任务包 result.md 中的分类、证据和建议 |
| repair | 失败诊断与修复 | workspace-write | 经过测试的修复或保留失败的说明 |

`--kind api` 只影响 Web 生成阶段的 Skill；其他阶段和 App 不依赖该值。调用器逐阶段运行，不会自动将生成的计划无审查串入下一阶段。要执行生成，必须显式指定 `--plan`。

## 2. 首次接入

确保在终端可以执行 `codex --version` 并已通过现有方式登录。脚本默认仅生成任务包；添加 `--execute` 会调用模型并消耗当前登录账号的相应额度。

进入任一工程执行，或从仓库根目录执行 `python3 tools/agent_runner.py ...` 均可；脚本根据自身文件路径定位工程，不依赖调用时所在目录。

例如从根目录：

```bash
python3 tools/agent_runner.py --project web --role plan --task '为待办模块规划标题边界测试' --execute
```

输出目录为 `web-api-agent-tests/artifacts/agents/<UTC时间-随机ID>/`，检查 `result.md`，将确认的计划保存到 `specs/title-boundaries.md`，再执行：

```bash
python3 tools/agent_runner.py --project web --role generate --kind api --plan specs/title-boundaries.md --task '根据计划实现边界测试，复用现有fixture' --execute
```

Agent 可以调用工具多轮推进，但任务调用器只发起一次当前阶段执行；没有无限自愈循环。诊断 Skill 规定最多两轮修复后重跑，这是给 Agent 的工作约定，**不是操作系统强制的调用次数限制**。调用器在进程层面强制总超时，默认600秒，可用 `--timeout` 改变。

## 3. 失败诊断和有边界修复

先运行回归，查看本地报告与 Trace，把必要错误、用例 ID、重现步骤、状态码和已核实页面变化写入项目内 `artifacts/failure-summary.md`。不要复制完整含 token 的请求或截图进任务。

```bash
python3 tools/agent_runner.py --project web --role diagnose --failure artifacts/failure-summary.md --task '判断是产品缺陷、环境故障还是测试定位失效' --execute
python3 tools/agent_runner.py --project web --role repair --failure artifacts/failure-summary.md --task '只修复有证据支持的测试问题，保留业务断言' --execute
```

生成/修复阶段 Agent 退出成功后，调用器再次运行外部验证：Web 运行 `npm run typecheck` 和完整 `npm test`；App 运行 `.venv/bin/python -m pytest tests/unit`，指定 `--device-run` 才增加设备启动烟测。

修复范围包括已核实的定位器变化、错误的数据清理或不正确的等待机制。接口业务返回错误、应用功能缺失、设备未连接等不能靠放宽断言解决，应保留失败。

Skill 的文件修改限制是模型工作规则；`workspace-write` 是工作区权限范围，**不是只允许修改 tests 目录的强制白名单**。正式使用建议在干净分支、隔离 worktree 或 CI 容器中运行，并审查 `git diff`。当前工程没有实现自动提交、PR 或合并。

## 4. 如何理解任务包

| 文件 | 含义 |
|---|---|
| task.md | 精确发送给 Agent 的提示词和 Skill 路径 |
| manifest.json | 阶段、命令、状态、Agent退出码、外部验证范围与退出码 |
| events.jsonl | `codex exec --json` 的事件流 |
| stderr.log | CLI 进度及错误 |
| result.md | 模型最后的回答；不是测试通过证明 |
| check-N.log / check-N.err | 每次外部验证的输出 |

状态含义：`prepared` 未调用模型，`agent_failed` 模型进程失败或超时，`verification_failed` 外部检查失败，`tool_error` 工具无法启动，`completed` 当前阶段及其配置的检查完成。

`completed` 并不意味着所有业务测试都通过。例如计划阶段根本不运行完整回归，App 默认只有单元验证。应同时检查 `verification_scope`、验证命令与退出码。

## 5. 执行环境和权限

脚本使用参数数组调用子进程，不使用 shell 拼接任务；提示词通过 stdin 传递。超时会终止进程组，返回124；非零退出码会保留为失败。失败不会因模型最后一句“已完成”变成成功。

plan/diagnose 使用 read-only，generate/repair 使用 workspace-write。实际网络与命令能力还受宿主 Codex 的沙箱和执行策略影响；受限环境可能阻止浏览器启动、本机回环网络、Appium 或真实设备操作。遇到限制应在合适的隔离测试环境配置所需权限，再重跑；框架不会绕过权限。

自动阶段不能交互补充缺失的凭据或权限。先在普通终端安装依赖、验证目标服务和设备可用，再调用 Agent。登录、额度、模型可用性、网络策略均由实际 Codex 环境决定。

输入计划和失败证据必须位于所选项目内，禁止 `.env*`、`.git`、`.venv`、`node_modules`，并阻止软链接逃出项目。此校验不等于自动脱敏，文本和日志仍需检查。事件流、测试报告与截图不自动上传、不进入 Git。

## 6. 扩展自己的 Skill

在项目 `.agents/skills/<name>/SKILL.md` 中维护：

```markdown
---
name: qa-payment-api
description: 根据支付接口契约生成测试环境的支付接口用例，用于支付状态与幂等性验证。
---

读取实际接口契约与现有数据 fixture。
明确订单隔离、金额精度、状态转换和幂等键规则。
只操作测试环境；不得复用生产订单。
实现后运行约定的接口回归命令，报告退出码和未覆盖部分。
```

好的 Skill 应写入团队特有规则、契约路径、可运行命令和结束条件，而非重复通用“认真测试”。复杂说明放在 Skill 的 references 中，确定性重复操作才提取 scripts。

在宿主 Agent 内可直接用 `$qa-payment-api` 调用；要接入本项目 Python 调用器，需扩展 `skill_name()` 的映射。创建 Skill 不会自动安装 MCP 服务，也不会赋予模型新的浏览器或设备工具。

## 7. CI 与团队协作

`.github/workflows/qa.yml` 在 push/PR 运行 Web/API 与 App 框架检查，上传 HTML/JUnit/失败证据。它不在公共 Runner 中假装存在真实设备，也不自动调用模型。

真实 App 回归建议在配有模拟器/真机的自托管 Runner 上增加独立 job，预先配置平台驱动、安装包、UDID、账号与签名；通过 `pytest --device tests/device` 和指定 `tests/business` 路径执行。设备并发需要独立账号、Appium端口、Android systemPort 或 iOS WDA端口规划，当前模板默认单设备。

AI适合新增场景、维护定位与辅助诊断；提交后的稳定测试仍由 CI 确定性执行。对 Agent 生成的变更，应检查是否覆盖真实需求、是否削弱断言、是否引入状态污染，再进入正常代码审查流程。
