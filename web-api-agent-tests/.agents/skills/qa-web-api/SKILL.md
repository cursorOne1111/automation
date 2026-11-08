---
name: qa-web-api
description: 根据接口契约和测试计划生成 Playwright API 测试，验证状态、数据和业务副作用。用于接口自动化与数据驱动边界覆盖。
---

# qa-web-api

先读取指定计划以及相关接口实现或契约。待办场景读取 src/api/todo-client.ts 与 tests/fixtures.ts；订单/库存场景读取 docs/BACKEND-API.md、src/api/backend-client.ts 和 tests/backend/fixtures.ts。
以实际契约为依据，验证状态码、Zod 数据结构、关键字段和持久化副作用；不能只有 HTTP 200 检查。
按业务复用 TodoClient 或 BackendClient 与对应 fixture；新业务需独立数据及 finally 清理，负向用例验证订单、库存等关键副作用。订单重放需核对幂等键与参数，取消需核对版本与库存回补。
无幂等保证时不重试写接口。测试账号从环境读取，不把 token 放入代码或报告。
运行 npm run typecheck；待办使用 npm run test:api，后端专项使用 npm run test:backend，全部接口使用 npm run test:api:all。报告实际通过数、契约差异和并发验证的环境边界。
