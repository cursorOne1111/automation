---
name: qa-mobile-plan
description: 为 Android/iOS App 编写基于设备环境的测试计划。用于移动端场景、设备矩阵和前置条件分析。
---

# qa-mobile-plan

读取 config/、framework/settings.py、specs/launch.md 和目标 App 需求。
明确平台、系统版本、包名或 bundle ID、设备 UDID、应用安装方式、权限、登录态和清理方式。
业务定位必须来自 Appium Inspector 或真实设备页面树；可使用 scripts/inspect_app.py --source 采集独立会话证据。
区分框架单元测试、设备烟测、业务端到端测试；无设备时只记录待验证项。
输出含用例 ID、步骤、预期、平台差异和测试数据的计划，不修改用例。
