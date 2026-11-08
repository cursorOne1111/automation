# Appium + Agent + Skill App 自动化测试框架

本工程以 pytest 管理测试生命周期，通过 Appium 3 和 Python Appium Client 控制 Android/iOS 设备，分别使用 UiAutomator2 与 XCUITest 驱动。配置加载、会话创建、页面交互与失败证据分别封装，项目 Skills 用于辅助 App 场景规划、用例生成和失败分析。

[项目总览](../readme.md) · [设计说明](../docs/README.md) · [Agent 工作流](../docs/AGENT-WORKFLOW.md) · [验证记录](../docs/VALIDATION.md)

## 工程架构与测试分层

| 层次 | 实现入口 | 职责与执行条件 |
|---|---|---|
| 平台配置 | [framework/settings.py](framework/settings.py)、[config/android.json](config/android.json)、[config/ios.json](config/ios.json) | 校验平台、加载 capabilities、应用环境变量覆盖 |
| 驱动与生命周期 | [framework/driver.py](framework/driver.py)、[conftest.py](conftest.py) | 创建 W3C Options、建立会话、关闭驱动与采集失败证据 |
| 页面交互 | [pages/base_page.py](pages/base_page.py)、[pages/login_page.py](pages/login_page.py) | 显式等待、控件交互与业务流程封装 |
| 框架单元测试 | `tests/unit/` | 不连接设备，验证配置、驱动参数和报告链路 |
| 设备烟测 | [tests/device/test_launch.py](tests/device/test_launch.py) | 需要 Appium、驱动、设备和 `--device` |
| 业务端到端 | [tests/business/test_login.py](tests/business/test_login.py) | 额外需要实际 App、账号、页面定位与业务状态管理 |

默认 pytest 仅收集框架单元测试。设备烟测与业务用例通过显式路径执行，各层的结果分别报告。

## 1. 先运行设备外验证

本工程锁定的 Python 依赖兼容 Python 3.9；新环境建议使用受支持且链接 OpenSSL 的 Python，并在升级依赖时核实兼容矩阵。macOS 系统 Python 3.9 的 LibreSSL 会触发 urllib3 兼容性警告，本次单元测试通过不等于真实 HTTPS 链路已验证。Node 服务使用 Node >=22.12 与 npm >=10。

```bash
cd mobile-agent-tests
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-lock.txt
python -m pytest tests/unit --html=artifacts/unit-report.html --self-contained-html
```

`requirements.txt` 固定直接依赖，`requirements-lock.txt` 记录本次验证解析的完整依赖。默认 `python -m pytest` 只收集 `tests/unit`，不会连接设备。此类结果验证配置和 Driver 工厂，不能证明 App 操作成功。

## 2. 准备 Appium 服务

```bash
npm ci
npx appium --version
npx appium driver install uiautomator2
npx appium driver doctor uiautomator2
npm run server
```

Appium 服务端和平台驱动独立发布。本项目的本地 Appium 会将工程识别为 Appium home；`APPIUM_HOME` 可以显式改变扩展目录。平台驱动的安装结果是否进入 package.json/lock，取决于 Appium 的项目模式与安装方式，不能只凭服务端 lock 假定已锁定驱动。首次安装后执行 `npx appium driver list --installed`，在团队设备环境记录实际驱动版本。后续用 `npx appium driver install uiautomator2@<已验证版本>` 重建，不要直接滚动升级。

Android 还需要 JDK、Android SDK、`ANDROID_HOME`、platform-tools 和已启动的模拟器或授权的测试机。用 `adb devices -l` 查看设备，doctor 检查缺失项。服务默认仅监听 `127.0.0.1:4723`，客户端使用根路径 URL，无 `/wd/hub`。

## 3. Android 真实设备烟测

终端一保持 Appium 服务运行。终端二进入本项目：

```bash
source .venv/bin/activate
cp .env.example .env
adb devices -l
# 将下方UDID替换成 adb 输出的设备
MOBILE_PLATFORM=android DEVICE_UDID=emulator-5554 python -m pytest --device tests/device --html=artifacts/device-report.html --self-contained-html
```

默认启动 Android 系统设置 `com.android.settings/.Settings`，无需 APK。厂商系统的设置 Activity 可能不同，需配置 `APP_PACKAGE` / `APP_ACTIVITY`。烟测验证会话、原生页面树、截图、目标应用前台。

`.env` 中可配置设备名、UDID、系统版本，或用环境变量临时覆盖。配置加载顺序：按 `MOBILE_PLATFORM` 选择平台；存在 `CAPABILITIES_FILE` 时使用该文件替换默认 JSON，然后应用环境变量覆盖。自定义 JSON 不会与默认模板合并。

## 4. iOS 模拟器与真机

需要 macOS、完整 Xcode、命令行工具、可用模拟器。查看设备并安装驱动：

```bash
xcrun simctl list devices available
npx appium driver install xcuitest
npx appium driver doctor xcuitest
# 终端一：npm run server
# 终端二：确保目标模拟器已启动
MOBILE_PLATFORM=ios DEVICE_UDID=实际模拟器UDID python -m pytest --device tests/device
```

iOS 默认打开 `com.apple.Preferences`。模拟器测试业务 App 通常使用模拟器构建的 `.app`；真机使用适配设备并正确签名的构建。真机还需信任、开发者模式和 WebDriverAgent 签名配置，可通过自定义 JSON capabilities 增加 `appium:xcodeOrgId`、`appium:xcodeSigningId` 等实际配置，具体依驱动文档与团队签名环境确定。

这些系统环境和签名不由框架自动安装或处理。

## 5. 接入业务 App 和登录流程

在 `.env` 设置绝对 `APP_PATH`（APK、IPA 或 .app 目录）；本地客户端会检查路径存在。指定安装包后，配置器会移除默认系统设置入口，避免误启系统设置。若还显式设置 `APP_PACKAGE` / `APP_ACTIVITY` / `APP_BUNDLE_ID`，则保留你指定的入口。

远程设备云需要服务端可访问的应用标识，当前本地路径校验不覆盖云存储 ID，接入时需扩展配置器。

```dotenv
MOBILE_PLATFORM=android
APP_PATH=/absolute/path/test-build.apk
DEVICE_UDID=emulator-5554
LOGIN_USERNAME_ID=login-username
LOGIN_PASSWORD_ID=login-password
LOGIN_SUBMIT_ID=login-submit
LOGIN_SUCCESS_ID=home-screen
TEST_USERNAME=qa-user
TEST_PASSWORD=从测试环境安全获取
```

上面的定位值是接入示意，必须通过 Appium Inspector 或实际页面树核实后替换。当前 LoginPage 采用 accessibility ID；如果应用只暴露 Android resource-id，需要修改该页面对象的 locator 策略。

```bash
python scripts/inspect_app.py --source
python -m pytest --device tests/business/test_login.py --html=artifacts/business-report.html --self-contained-html
```

采集脚本会创建并关闭独立会话；它不是连接已有 Inspector 会话。设备默认可能重置应用，采集和测试应使用专用测试设备与账号。

登录实现位于 `pages/login_page.py`；`BasePage` 使用显式等待，`conftest.py` 统一创建和释放会话。真实业务还需补充登出、账号状态和数据清理；模板未替业务决定这些规则，因此业务用例暂不支持并行账号共享。

## 6. Agent 使用示例

在 Codex 中打开本目录：

```text
使用 $qa-mobile-plan 根据 specs/launch.md 和真实登录需求生成 App 测试计划，区分 Android/iOS。
使用 $qa-mobile-ui 根据计划和 artifacts/inspection/source.xml 实现登录测试，复用 driver fixture。
使用 $qa-test-triage 分析 Appium 连接或定位失败；无设备时明确报告未验证。
```

脚本调用：

```bash
python3 ../tools/agent_runner.py --project mobile --role plan --task '规划 Android 登录测试'
python3 ../tools/agent_runner.py --project mobile --role generate --plan specs/launch.md --task '完善启动烟测覆盖' --execute
# 设备和服务已就绪时额外跑设备烟测
python3 ../tools/agent_runner.py --project mobile --role generate --plan specs/launch.md --task '完善启动烟测覆盖' --execute --device-run
```

默认外部验证仅运行框架单元测试；`--device-run` 增加 `tests/device`，**不会自动运行业务登录**。业务测试需要单独执行，并记录真实账号、App 和设备条件。工作原理见 [Agent 工作流](../docs/AGENT-WORKFLOW.md)。

## 7. 失败证据与常见问题

失败时写入 `artifacts/<用例ID哈希>/failure.json`，已创建驱动时同时采集 `failure.png`。截图以内嵌形式加入 HTML 报告。设置 `CAPTURES_PAGE_SOURCE=1` 才会额外保存页面树 XML；XML 和截图可能含业务数据，先脱敏再交给 Agent。

| 现象 | 优先检查 |
|---|---|
| Connection refused | Appium 是否启动，端口和 APPIUM_URL 是否一致 |
| 找不到驱动 | `appium driver list --installed`，平台 automationName |
| 多设备不确定 | DEVICE_UDID 是否明确指定 |
| Activity 不存在 | APK 实际入口，APP_PACKAGE / APP_ACTIVITY |
| NoSuchElement / Timeout | 页面是否正确、权限弹窗、真实 accessibility ID |
| iOS WDA 构建失败 | Xcode、签名、真机信任、驱动兼容版本 |

不要把连接失败改成 skip 来让 CI 变绿；设备外检查和设备测试应分别报告。当前验证范围见 [验证记录](../docs/VALIDATION.md)。

## 8. 配置参考

`conftest.py` 从工程 `.env` 加载配置，保留进程中已有环境变量。独立检查脚本也读取同一 `.env`。capabilities 中的 `platformName` 与 `appium:automationName` 必须匹配所选平台。

| 参数 | 默认行为 | 说明 |
|---|---|---|
| `MOBILE_PLATFORM` | `android` | 仅接受 `android`、`ios` |
| `APPIUM_URL` | `http://127.0.0.1:4723` | 支持无内嵌凭据的 HTTP(S) 地址 |
| `CAPABILITIES_FILE` | 对应平台的 `config/*.json` | 自定义文件替换平台模板，相对路径基于工程目录 |
| `DEVICE_NAME` / `DEVICE_UDID` / `PLATFORM_VERSION` | 模板值或未设置 | 覆盖设备标识与系统版本 |
| `APP_PATH` | 未设置 | 本地 App 安装包或目录，必须存在 |
| `APP_PACKAGE` / `APP_ACTIVITY` / `APP_BUNDLE_ID` | 默认系统设置入口 | 根据平台与实际 App 指定入口 |
| `CAPTURES_PAGE_SOURCE` | 不采集 | 为 `1` 时额外保存失败页面树 |

安装包、设备和入口必须相互匹配。模板不预置团队签名、设备云认证、测试账号或业务数据清理规则，这些配置应在真实项目接入时明确。

## 9. 用例生命周期与开发规范

测试启动时先解析并校验配置，`driver` fixture 再创建独立 Appium 会话。页面对象使用显式等待完成交互；失败报告阶段采集可用证据，测试结束后在 `finally` 中关闭会话。

新增业务用例建议按以下顺序实施：

1. 在 `specs/` 记录平台、App 版本、账号状态、权限弹窗和预期结果。
2. 通过 Inspector 或页面树核实定位，把平台差异封装到页面对象。
3. 明确安装与重置策略、登录前置条件以及测试后数据回收，确保用例可重复运行。
4. 先验证框架，再执行指定设备用例，分别记录设备环境与测试报告。
5. 用真实业务状态验证结果，审查 Agent 是否保留了原有断言和清理逻辑。

默认配置采用单设备流程。并行执行需要额外规划设备 UDID、端口、账号与应用数据隔离，不能只增加 pytest 并发数。

## 10. 持续集成与接入验收

根目录 [qa.yml](../.github/workflows/qa.yml) 的 `mobile-framework` job 使用 Python 3.11，运行 Agent 调用器测试与 App 框架单元测试，归档 HTML/JUnit 与框架证据，保留 7 天。

设备测试需要单独配置具备 Android 或 iOS 环境的 Runner，并提供驱动版本、App 构建、UDID 与所需签名。建议先以设备启动烟测验证基础环境，再执行业务用例；两个结果分别作为环境验收和业务回归依据。

Appium 服务可用、框架单元测试通过、设备会话成功与业务断言通过分别代表不同层次的验证。接入记录应明确实际执行到哪一层，并在报告中保留未验证范围。
