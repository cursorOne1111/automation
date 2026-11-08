# Web UI + API Agent 自动化测试框架

本工程基于 Playwright Test + TypeScript，统一管理 Web UI 与 HTTP API 自动化。通过共享 fixture、接口客户端、页面对象和响应契约，实现测试数据隔离、跨层验证与失败证据留存；编码 Agent 通过项目 Skills 辅助规划、生成和维护用例。

[后端 API 专项指南](docs/BACKEND-API.md) · [项目总览](../readme.md) · [设计说明](../docs/README.md) · [Agent 工作流](../docs/AGENT-WORKFLOW.md) · [验证记录](../docs/VALIDATION.md)

## 工程架构与职责

| 模块 | 实现入口 | 维护职责 |
|---|---|---|
| 运行配置 | [playwright.config.ts](playwright.config.ts) | 目标环境、项目匹配、并发、重试、服务与报告 |
| 数据与上下文 | [tests/fixtures.ts](tests/fixtures.ts) | 每用例租户、请求上下文、Page Object 注入与最终清理 |
| 接口适配 | [src/api/todo-client.ts](src/api/todo-client.ts) | HTTP 交互封装与 Zod 响应契约 |
| 页面适配 | [src/pages/todo-page.ts](src/pages/todo-page.ts) | 页面入口、语义定位和交互动作 |
| 用例与计划 | [tests/api/todos.spec.ts](tests/api/todos.spec.ts)、[specs/todos.md](specs/todos.md) | 需求场景、业务断言与覆盖映射 |
| Agent 约定 | [AGENTS.md](AGENTS.md)、`.agents/skills/` | 工程规则、证据依据与验证命令 |

测试引擎直接运行已提交代码，无需模型服务。Agent 生成阶段只在新增或维护测试时使用；接入真实网站前需替换示例契约、定位和数据机制。

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
npm run test:backend
npm run test:api:all
npm run test:ui
npm run test:headed
npx playwright test --project=api --grep API-001
```

默认测试配置拒绝复用已有 3100 端口服务，避免误测其他应用。端口占用时停止对应服务，或使用 `DEMO_PORT=3200 npm test`。若 `.env` 中已设置 URL，要同步改成新端口或删除 URL 配置。

## 后端 API 专项

独立 `backend-api` 项目使用 `/api/v1` 商品与订单服务，新增50个用例，覆盖Token鉴权、角色与租户、参数边界、协议错误、金额、库存、幂等、版本与并发一致性。它复用 Playwright 执行与报告体系，客户端、fixture和业务契约独立于待办示例。

`npm run test:api` 保持运行原待办接口；`npm run test:backend` 运行后端专项；`npm run test:api:all` 运行两组接口；`npm test` 包含UI及全部接口项目。专项无需安装浏览器。

完整接口表、权限矩阵、数据基线、并发不变量、真实环境接入与Agent示例见 [后端 API 测试指南](docs/BACKEND-API.md)，用例映射见 [后端测试计划](specs/backend-api.md)。

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

修改 `BASE_URL` 与 `API_BASE_URL`，可分别指向前端与接口测试环境。UI、待办 API 与 `BACKEND_API_BASE_URL` 的实际地址都指向非 demo 地址时，自动启动演示服务的配置会关闭。

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

## 7. 配置参考

首次接入可复制 [.env.example](.env.example)。已有进程环境变量优先于 `.env`；配置的实际取值由运行配置和 fixture 共同决定。

| 参数 | 默认值 | 作用 |
|---|---|---|
| `DEMO_PORT` | `3100` | 本地演示服务端口，同时构成默认地址 |
| `BASE_URL` | `http://127.0.0.1:<DEMO_PORT>` | UI 地址；未指定 API 地址时也作为 API 默认地址 |
| `API_BASE_URL` | `BASE_URL` 的实际值 | API 项目和 TodoClient 的请求基址 |
| `BACKEND_API_BASE_URL` | `API_BASE_URL` 的实际值 | 后端订单与库存专项地址，独立登录与角色账号 |
| `API_TOKEN` | 未设置 | 为 TodoClient 请求上下文提供 Bearer token |
| `CI` | 未设置 | 非空时禁止 test.only，设置 2 个 worker 与 1 次失败重试 |

当 UI、待办 API 或后端专项任一地址等于本地 demo 地址时，框架会启动演示服务。启动判定使用地址字符串比较，修改地址时应保持端口和格式一致。使用带网关前缀的 API 地址时，需核实客户端以 `/` 开头的路径是否符合目标路由。

当前配置启用并行执行、单用例 30 秒超时、断言等待 5 秒。上述值统一在运行配置中维护，新增用例应优先使用可观察的状态等待。

## 8. 新增用例与代码审查

1. 在 `specs/` 中记录场景编号、前置条件、输入、预期及清理方式。
2. 在 `src/api/` 或 `src/pages/` 补充可复用的业务适配，避免在测试中重复定位和请求构造。
3. 在对应 `tests/api/` 或 `tests/ui/` 添加用例，复用共享 fixture；新增资源必须有清理策略。
4. 运行类型检查与相关测试，再运行完整回归，核实失败附件和数据残留。
5. 审查断言是否覆盖业务结果、接口副作用和状态持久化，再提交变更。

现有租户隔离只适用于本地 demo。真实业务需要基于实际服务设计隔离与回收策略；浏览器登录状态和 API 身份也需要分别处理。

## 9. 持续集成与验收

根目录 [qa.yml](../.github/workflows/qa.yml) 的 `web-api` job 安装锁定依赖与 Chromium，依次执行类型检查和完整测试，并归档 HTML/JUnit 与失败附件，保留 7 天。

接入验收应同时满足：目标环境正确、核心流程可独立重跑、清理可靠、失败能定位、Agent 变更保留有效断言。当前执行矩阵为 Chromium；浏览器兼容性矩阵需要添加项目配置与相应用例后另行验证。
