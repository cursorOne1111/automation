# 后端 API 自动化测试指南

本专项以“商品库存与订单”为业务模型，使用 Playwright APIRequestContext 发送真实 HTTP 请求，验证鉴权、权限、资源生命周期、参数边界、幂等、版本冲突和库存一致性。测试无需启动浏览器。

[工程 README](../README.md) · [客户端与响应契约](../src/api/backend-client.ts) · [测试计划](../specs/backend-api.md) · [本地服务](../demo/backend.mjs)

## 1. 运行方式

在 `web-api-agent-tests/` 目录执行：

```bash
npm ci
npm run typecheck
npm run test:backend
```

默认启动本地演示服务并在结束后关闭。API 专项无需安装 Chromium；运行完整 `npm test` 时需要按工程指南安装浏览器。

```bash
# 原有待办接口回归
npm run test:api
# 后端订单/库存专项
npm run test:backend
# 两组接口测试一起执行
npm run test:api:all
# 只执行并发类场景
npm run test:backend -- --grep '并发'
# UI、待办接口与后端专项完整回归
npm test
```

## 2. 代码组织与执行生命周期

| 模块 | 位置 | 职责 |
|---|---|---|
| 演示服务 | `demo/backend.mjs` | `/api/v1` 业务路由、会话、权限、库存及订单状态 |
| 客户端 | `src/api/backend-client.ts` | 登录、商品、订单、取消、注销与清理请求 |
| 响应契约 | 同上，Zod schemas | Token、错误、商品分页、订单与列表结构 |
| fixture | `tests/backend/fixtures.ts` | 独立租户、管理员/只读用户、请求上下文和最终清理 |
| 鉴权用例 | `tests/backend/auth.spec.ts` | 凭据、角色、Token、租户和会话撤销 |
| 业务用例 | `tests/backend/orders.spec.ts` | 生命周期、幂等、库存、状态和并发 |
| 协议与输入 | `tests/backend/validation.spec.ts` | 分页、类型、必填、请求体、方法与路径 |

每个测试使用独立 UUID 租户，为管理员与只读用户获取独立 Token。用例结束后由管理员清除租户订单、库存与所有会话，再释放请求上下文。即使用例失败也尝试清理；初始化在管理员登录成功后、只读用户登录失败时同样执行清理。

客户端只封装交互；测试明确校验状态码和业务预期。响应通过 Zod 严格校验字段与类型，负向场景进一步检查订单或库存未发生非法变更。

## 3. 接口契约

基础路径：`/api/v1`。所有接口要求合法 `x-test-tenant`；除登录外均要求 `Authorization: Bearer <token>`。租户值为1～100位字母、数字或短横线。

| 方法 | 路径 | 请求 | 成功响应 |
|---|---|---|---|
| POST | `/auth/token` | `{username,password}` | 200 Token |
| POST | `/auth/logout` | 无 | 204，无响应体，当前Token失效 |
| GET | `/products` | `offset>=0`，`1<=limit<=100`，默认0/20 | 200 `{items,total,offset,limit}` |
| GET | `/orders` | 无 | 200 `{items,total}` |
| POST | `/orders` | `{sku,quantity}` 与 `idempotency-key` | 首次201，成功结果重放200 |
| GET | `/orders/:id` | UUID订单ID | 200 Order |
| POST | `/orders/:id/cancel` | `{version}` | 200，状态改为cancelled，版本加1 |
| DELETE | `/test-data` | 管理员，测试专用接口 | 204，清除租户资源并撤销全部Token |

Order 字段：`id`、`sku`、`quantity`、`amountCents`、`status`、`version`。金额由服务端使用商品单价和数量计算，单位为整数分；客户端不能指定金额。初始状态为 `created`、版本为1。

Token 字段：`accessToken`、`tokenType=Bearer`、`expiresIn=3600`、`role`。本示例使用内存中的不透明 Token，服务端检查有效期；当前没有通过时间推进验证过期场景。

错误统一为 `{ "error": { "code": "业务错误码", "message": "错误描述" } }`。

| HTTP状态 | 代表错误码 | 场景 |
|---|---|---|
| 400 | `INVALID_JSON`、`INVALID_TENANT`、`INVALID_ID`、`INVALID_IDEMPOTENCY_KEY` | 协议或标识错误 |
| 401 | `UNAUTHORIZED`、`INVALID_CREDENTIALS` | 无有效Token、注销后访问、凭据错误 |
| 403 | `FORBIDDEN`、`TENANT_FORBIDDEN` | 角色无权写入、Token与租户不匹配 |
| 404 | `PRODUCT_NOT_FOUND`、`ORDER_NOT_FOUND`、`NOT_FOUND` | 资源或路径不存在 |
| 405 | `METHOD_NOT_ALLOWED` | 不支持的方法，同时返回Allow头 |
| 409 | `INSUFFICIENT_STOCK`、`IDEMPOTENCY_CONFLICT`、`VERSION_CONFLICT`、`INVALID_ORDER_STATE` | 业务状态冲突 |
| 413 / 415 / 422 | `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` / `VALIDATION_ERROR` | 超过16KiB、非JSON、字段不合法 |

## 4. 权限和数据模型

| 操作 | admin | reader |
|---|---|---|
| 查询商品与订单 | 允许 | 允许 |
| 创建与取消订单 | 允许 | 403 |
| 清理测试数据 | 允许 | 403 |
| 注销本人Token | 允许 | 允许 |
| 使用其他租户头访问 | 403 | 403 |

演示账号：`qa-admin / demo-admin-password`、`qa-reader / demo-reader-password`，均为公开的本地示例值。真实测试凭据从环境注入，不应写入代码或文档。

每个租户默认有两种商品：`KB-001` 单价1299分、库存5；`MS-001` 单价499分、库存10。隔离机制用于并行测试，登录时声明的租户不构成生产级身份或组织认证。

## 5. 幂等、版本与并发断言

订单创建要求1～100位字母、数字或短横线组成的幂等键。同租户内，同键同参数返回首次成功创建的响应快照；同键不同参数返回409。失败创建不会写入幂等结果。当前没有实现过期回收或跨进程幂等存储。

取消订单要求传入当前版本：旧版本返回409，成功后版本加1并回补库存；已取消订单不能再次回补。幂等重放返回原始创建快照，当前状态应通过订单查询接口读取。

三个并发场景验证以下不变量：

- 8个不同幂等键同时购买库存5的商品：5次成功、3次库存不足，订单数量和剩余库存守恒。
- 6次相同幂等键提交：仅1次创建，其余重放同一订单，只扣一次库存。
- 同一版本同时取消两次：仅1次成功，另一次版本冲突，只回补一次库存。

演示服务在关键状态更新之间不执行异步等待，验证范围是单 Node 进程内的业务一致性。真实后端需要用数据库事务、唯一约束、乐观锁或实际分布式机制实现同类保证；本测试结果不能证明这些机制已经落地，也不属于吞吐量或压测结论。

## 6. 接入真实后端

配置项：

| 参数 | 默认值 | 用途 |
|---|---|---|
| `BACKEND_API_BASE_URL` | 跟随 `API_BASE_URL` | 后端专项请求基址 |
| `BACKEND_ADMIN_USERNAME` / `BACKEND_ADMIN_PASSWORD` | 本地管理员账号 | 写入与清理权限 |
| `BACKEND_READER_USERNAME` / `BACKEND_READER_PASSWORD` | 本地只读账号 | 负向权限验证 |

实际接入需要同时调整以下内容：

1. **认证与权限**：替换登录路径、Token字段、实际角色与租户来源。后端客户端不会读取通用 `API_TOKEN`。
2. **资源与契约**：对齐商品、订单、金额单位、状态转换、分页与错误结构。
3. **数据隔离**：将随机租户改为有权限的测试组织、独立资源前缀或受控数据准备方案。
4. **断言基线**：示例库存、商品ID和固定数量来自本地服务；真实环境必须通过可靠的准备接口或 fixture 建立基线。
5. **清理机制**：将测试专用 `/test-data` 替换为实际支持的回收机制，避免向生产服务暴露此类入口。

现有服务启动策略会综合 UI、待办 API、后端 API 地址：任一地址仍指向本地 demo 时会启动 demo。只运行远端后端专项但保留其他本地默认地址时，仍会启动本地服务；需要完全关闭自动服务时三个地址均需指向对应远端环境。

## 7. Agent 与持续集成

复用 `qa-web-api` Skill，无需新增模型依赖。在工程目录内准备任务包：

```bash
python3 ../tools/agent_runner.py --project web --role generate --kind api --plan specs/backend-api.md --task '根据后端计划检查幂等、权限和库存测试覆盖'
```

检查任务包后添加 `--execute` 才会实际调用模型。生成后调用器运行类型检查和完整测试；根目录现有 CI 的 `npm test` 也会自动收集 `backend-api` 项目。

报告仍输出到工程 `playwright-report/` 与 `test-results/`。报告和 Trace 可能包含测试Token与业务数据，按已有忽略和脱敏要求管理。验收应以实际退出码、响应契约、持久化状态与副作用共同判断。
