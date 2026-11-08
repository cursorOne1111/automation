# 验证记录

验证日期：2026-11-08。环境：macOS arm64、Node 24.14.1、npm 11.11.0、Python 3.9.6。

## 已实际执行

| 范围 | 命令 / 操作 | 结果 |
|---|---|---|
| Web 依赖安装 | npm install，生成 package-lock.json | 成功，审计0告警 |
| TypeScript | npm run typecheck | 通过 |
| 独立接口回归 | npm test -- --project=api | 10 passed |
| 完整 Web/API 回归 | npm test | 14 passed：10 API + 4 Chromium |
| UI 探索脚本 | 启动 demo，运行 node scripts/snapshot.mjs | 生成 ARIA 树和截图，并校验包含标题 |
| App Python 依赖 | pip install 指定直接依赖，pip freeze | 成功，完整锁定结果见 requirements-lock.txt |
| Python 依赖一致性 | pip check | No broken requirements found |
| App 框架回归 | python -m pytest tests/unit，HTML/JUnit报告 | 14 passed |
| 失败证据链路 | 框架测试内部启动受控失败子进程 | 确认非零退出、JSON、PNG、XML与HTML内嵌图；外层测试通过 |
| Agent 调用器 | python3 -m unittest discover -s tools -p 'test_*.py' | 7 passed |
| Agent 任务包 | Web generate准备、App plan准备 | 成功生成任务包，未调用模型 |
| Skills | skill-creator 的 quick_validate.py | 7个项目级 Skills 全部有效 |
| Appium 服务 | Appium 3.9.0启动，GET /status，关闭服务 | HTTP 200，ready=true，正常关闭 |
| Python 语法 | 解析所有项目 Python 源码 | 通过 |

本次确定性用例合计35项：Web/API 14、App框架14、调用器7。独立接口回归与完整回归中的接口用例相同，不重复计算。

调用器测试覆盖：准备模式不调用模型、外部验证失败保留非零状态、路径与软链接边界、子进程退出码、超时终止、stdin传递。模拟的 Agent 退出结果用于验证控制流程，不能替代真实模型调用验证。

## 已知限制与风险

1. 未提供真实业务网站、API契约、App安装包、测试账号和设备；目前 Web/API 结果属于自带 demo。
2. 未安装 Android/iOS 平台驱动、未连接模拟器或真机；没有执行 tests/device 和 tests/business。Appium ready 只证明服务可用。
3. 未发起真实 codex exec 模型任务；CLI 用法已依据官方文档和本机帮助核实，任务包和过程控制已测试。登录、额度、模型、沙箱网络与设备访问需在实际环境验证。
4. Appium 的 npm audit 有9项 moderate 依赖告警，集中在 glob/minimatch/readdir-glob/archiver 及传递依赖。当前自动建议包含将 Appium 降至2.0.1的主版本变更，未执行强制降级，也未用未验证的 override 改写依赖。服务只绑定本机，应在升级时重新审计与回归。
5. 本机 Python 使用 LibreSSL 2.8.3，urllib3提示需要 OpenSSL 1.1.1+；本次测试没有验证 HTTPS 通信。真实环境建议使用链接受支持 OpenSSL 的 Python。
6. GitHub Actions 文件已静态检查，未在远端触发。平台驱动、iOS签名、真实业务状态清理与设备并发需按接入环境配置。

## 产物与下一步

Web报告：web-api-agent-tests/playwright-report/index.html；JUnit：web-api-agent-tests/test-results/junit.xml。
App框架报告：mobile-agent-tests/artifacts/unit-report.html；JUnit：mobile-agent-tests/artifacts/unit-junit.xml。
探索截图、任务包、失败证据在各工程 artifacts/ 内，均被 Git 忽略。

先按两个工程 README 运行本地示例，再替换真实环境契约和定位。App先跑系统设置启动烟测，再接入业务登录；不要将设备外通过结果作为业务端到端覆盖。
