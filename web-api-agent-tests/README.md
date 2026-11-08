# Web UI + API Agent 自动化测试框架

采用 Playwright Test + TypeScript。UI 和 API 使用同一执行器、fixture 与报告，Agent 通过 `.agents/skills/` 规划、生成和诊断。

## 1. 快速运行

从仓库根目录执行：

```bash
cd web-api-agent-tests
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run report
```

Linux CI 首次安装浏览器使用 `npx playwright install --with-deps chromium`。测试默认自动启动 `127.0.0.1:3100` 的本地 demo，完成后关闭；无需启动外部服务或注册账号。

单独执行：

```bash
npm run test:api
npm run test:ui
npm run test:headed
npx playwright test --project=api --grep API-001
```

默认测试配置拒绝复用已有 3100 端口服务，避免误测其他应用。端口占用时停止对应服务，或使用 `DEMO_PORT=3200 npm test`。若 `.env` 中已设置 URL，要同步改成新端口或删除 URL 配置。

## 2. 已实现的测试

| 测试范围 | 实现 | 关键验证 |
|---|---|---|
| 接口生命周期 | tests/api/todos.spec.ts | 创建201、查询200、完成状态持久化、严格契约 |
| 标题边界 | 同上，5组数据驱动 | 空串、空白、超长、数字、null 均422且不写入 |
| 异常与隔离 | 同上 | 404、租户隔离、状态类型、租户缺失 |
| UI创建与完成 | tests/ui/todos.spec.ts | 添加、勾选、刷新后状态仍存在 |
| UI/API联动 | 同上 | API准备数据后UI可见 |
| 服务异常 | 同上 | POST返回503时显示提示且列表不新增 |
| Agent seed | tests/ui/seed.spec.ts | 页面可访问，供规划时初始化 |

每个测试分配 UUID 租户。`TodoClient` 封装 HTTP 交互，Zod 校验接口形状；`TodoPage` 封装页面交互，测试负责业务断言。fixture 为 API 建立独立上下文，结束后清理租户，失败时也执行清理。

UI 提交完成状态时等待对应 PATCH 响应，然后刷新验证持久化；不是只检查 checkbox 的瞬时状态。负向接口测试在拒绝请求后再次查询，验证没有脏数据。

## 3. 示例 API 契约

请求需带 `x-test-tenant`（1～100位字母、数字或短横线）。此机制用于演示数据隔离，不是认证。

| 方法 | 路径 | 输入 | 成功响应 |
|---|---|---|---|
| GET | /health | 无 | 200 `{status:"ok"}` |
| GET | /api/todos | 租户头 | 200 Todo[] |
| POST | /api/todos | `{title:string}`，trim后1～100字符 | 201 Todo |
| PATCH | /api/todos/:id | `{completed:boolean}` | 200 Todo |
| DELETE | /api/todos | 租户头，清理该租户 | 204，无响应体 |

Todo 形状：`{ id: UUID, title: string, completed: boolean }`。无效字段422、未找到任务404、租户缺失400、JSON无效400。demo 数据只驻留内存，服务重启即清空。

## 4. 接入真实项目

```bash
cp .env.example .env
```

修改 `BASE_URL` 与 `API_BASE_URL`，可分别指向前端与接口测试环境。两者都指向非 demo 地址时，自动启动演示服务的配置会关闭。

需要同时修改的代码：

1. `src/api/todo-client.ts`：换成业务路径、鉴权方式和实际响应契约。
2. `src/pages/todo-page.ts`：换成真实页面与已核实定位。
3. `tests/fixtures.ts`：替换租户机制、测试数据准备和清理。业务使用相对 API 路径时注意服务是否有网关前缀。
4. `tests/` 与 `specs/`：根据实际需求替换示例断言和测试计划。

`API_TOKEN` 只被 API fixture 读取，不会自动为浏览器登录。浏览器鉴权请按项目要求增加登录 fixture 或 `storageState`；状态文件可能含凭据，必须加入忽略规则。真实测试环境若不支持 DELETE 清理，需要重写 fixture，不能让清理错误覆盖长期遗留数据问题。

## 5. Agent + Skill 实操

在 Codex 中打开本目录，让其发现 `.agents/skills/`，例如：

```text
使用 $qa-web-plan 为待办事项增加“100字符边界与重复标题”的测试计划，写入 specs/boundaries.md。
使用 $qa-web-api 按 specs/boundaries.md 生成接口测试，执行类型检查和接口回归。
使用 $qa-web-ui 为现有添加任务流程补充UI回归，复用 tenant fixture。
使用 $qa-test-triage 分析已脱敏失败证据，不放宽业务断言。
```

脚本化调用（在当前项目目录）：

```bash
# 默认只生成任务包，不调用模型
python3 ../tools/agent_runner.py --project web --role plan --task '规划待办标题边界测试'

# 实际调用已登录 Codex；plan 输出保存到任务包 result.md
python3 ../tools/agent_runner.py --project web --role plan --task '规划待办标题边界测试' --execute

# 指定已有计划，生成代码后由外部调用器运行 typecheck 和完整测试
python3 ../tools/agent_runner.py --project web --role generate --kind api --plan specs/todos.md --task '检查并补齐计划中的接口覆盖' --execute
```

`npm run agent -- --role ... --task ...` 是同一脚本的快捷入口。更多失败诊断、修复与任务包说明见 [Agent 工作流](../docs/AGENT-WORKFLOW.md)。

可选使用官方 Playwright Agent 定义：

```bash
npm run agent:init
```

该命令在当前工程生成官方 Codex Agent 集成文件。它需要宿主 Agent 加载对应工具，生成定义本身不会调用模型或完成测试。本项目自定义 Skills 和调用器无需先执行这一步。

如需让 Agent 实时探索浏览器，可安装官方 CLI Skill：

```bash
npm run cli:skills
npx playwright-cli --help
```

官方 CLI Skill 与本项目测试 Skill 用途互补：前者教 Agent 操作浏览器，后者规定数据隔离、契约、代码与验证约定。

也可采集页面证据：终端一运行 `npm run demo`，终端二运行 `node scripts/snapshot.mjs`，得到 `artifacts/exploration/aria.yml` 和截图。完成后关闭 demo 再运行自动测试。

## 6. 报告和调试

- HTML：`playwright-report/index.html`，使用 `npm run report` 打开。
- JUnit：`test-results/junit.xml`，供 CI 解析。
- Trace、截图、视频：失败时保留在 `test-results/` 对应用例目录。
- Trace：`npx playwright show-trace <实际trace.zip路径>`。

CI 配置1次重试用于识别波动，初次失败的 Trace 仍保留；重试通过不应自动视为没有问题。Playwright HTML 报告会标记 flaky 测试。需要强制 flaky 失败时可在项目流程中添加对应策略。

报告、Trace 和截图可能含页面数据或网络凭据；默认已被 git 忽略，分享前先脱敏。测试和生成流程的实际验证状态见 [验证记录](../docs/VALIDATION.md)。
