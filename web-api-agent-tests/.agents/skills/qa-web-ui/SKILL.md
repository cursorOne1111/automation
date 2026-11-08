---
name: qa-web-ui
description: 根据测试计划生成、扩展并验证 Playwright UI 用例。用于网页流程、定位、网络异常和 UI/API 联动测试。
---

# qa-web-ui

先读取 tests/fixtures.ts、src/pages/todo-page.ts 与指定 specs 计划。
通过真实 aria snapshot、现有页面或页面源核实元素；优先 role/label/testid，避免猜测 CSS/XPath。
复用 tenant 和 todos fixture；每个用例独立数据，Page Object 只封装交互，业务结果放在测试中断言。
对加载使用 locator 自动等待，对网络提交使用特定响应等待，不使用固定 sleep。
跨层造数通过 todos fixture；模拟失败只拦截该用例目标请求。
运行 npm run typecheck 与 npm run test:ui；输出通过数与失败证据。完整回归由任务调用器执行。
