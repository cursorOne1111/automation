---
name: qa-web-plan
description: 为本项目 Web UI/API 需求编写可实现的测试计划。用于需求拆解、边界分析与覆盖评估。
---

# qa-web-plan

读取 specs/todos.md、tests/fixtures.ts 和与需求相关的 demo 或真实项目契约。
输出需求→场景→用例 ID 的映射，覆盖正向、边界、异常与清理方式。区分已观察事实和待核实假设。
UI 可运行 tests/ui/seed.spec.ts；需要实时定位时先启动 npm run demo，再运行 node scripts/snapshot.mjs，或使用已安装的 playwright-cli。
无真实环境时不要编造页面元素或接口字段；在计划中明确缺失的信息。
本阶段输出计划，不修改测试代码。生成阶段需要用户指定的计划文件。
