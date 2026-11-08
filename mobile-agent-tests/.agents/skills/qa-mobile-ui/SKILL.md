---
name: qa-mobile-ui
description: 根据计划生成、扩展并验证 Appium Android/iOS 自动化测试。用于真实设备流程和页面对象接入。
---

# qa-mobile-ui

先读取 framework/、conftest.py、pages/、指定计划。复用 driver fixture，确保 session.quit 清理。
优先 accessibility ID、Android resource-id；iOS predicate 仅在证据支持时使用。不要用未核实的坐标或 XPath。
使用 WebDriverWait 与 BasePage，系统权限弹窗与业务行为分开处理。跨平台定位差异放在页面对象。
提供真实业务测试时，先核实测试账号、App 入口和状态重置方式；缺失条件要报告，不能改成默认通过。
先运行 .venv/bin/python -m pytest tests/unit。设备已就绪时，运行 --device tests/device 或指定业务文件。
无设备不要宣称端到端通过；输出测试命令、实际结果和设备环境。
