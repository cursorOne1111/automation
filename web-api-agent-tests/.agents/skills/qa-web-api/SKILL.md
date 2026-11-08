---
name: qa-web-api
description: 根据接口契约和测试计划生成 Playwright API 测试，验证状态、数据和业务副作用。用于接口自动化与数据驱动边界覆盖。
---

# qa-web-api

先读取 src/api/todo-client.ts、tests/fixtures.ts、指定计划以及相关接口实现或 OpenAPI 文件。
以实际契约为依据，验证状态码、Zod 数据结构、关键字段和持久化副作用；不能只有 HTTP 200 检查。
复用 TodoClient 和 tenant；新业务需独立数据及 finally 清理，负向用例同时验证没有写入。
无幂等保证时不重试写接口。测试账号从环境读取，不把 token 放入代码或报告。
运行 npm run typecheck 与 npm run test:api；报告实际通过数和契约差异。
