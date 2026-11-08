import base64
import hashlib
import json
import os
from pathlib import Path

import pytest
import pytest_html
from dotenv import load_dotenv
from framework.settings import ROOT, Settings
from framework.driver import create_driver

load_dotenv(ROOT / ".env", override=False)


def pytest_addoption(parser):
    parser.addoption("--device", action="store_true", help="显式连接 Appium/设备")


@pytest.fixture
def mobile_settings():
    return Settings.from_env()


@pytest.fixture
def driver(request, mobile_settings):
    if not request.config.getoption("--device"):
        pytest.fail("设备测试必须传入 --device；无设备验证请运行 tests/unit")
    session = create_driver(mobile_settings)
    try:
        yield session
    finally:
        session.quit()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if not report.failed or report.when not in {"setup", "call"}:
        return
    output = ROOT / "artifacts" / hashlib.sha256(item.nodeid.encode()).hexdigest()[:16]
    output.mkdir(parents=True, exist_ok=True)
    # 不保存异常全文或 capabilities，减少账号、签名配置泄漏。
    evidence = {"test": item.nodeid, "phase": report.when, "outcome": report.outcome}
    session = item.funcargs.get("driver")
    if session is not None:
        try:
            png = session.get_screenshot_as_png()
            (output / "failure.png").write_bytes(png)
            report.extras = getattr(report, "extras", []) + [
                pytest_html.extras.png(base64.b64encode(png).decode("ascii"), name="failure")
            ]
            if os.getenv("CAPTURES_PAGE_SOURCE") == "1":
                (output / "source.xml").write_text(session.page_source, encoding="utf-8")
        except Exception as exc:
            evidence["capture_error_type"] = type(exc).__name__
    (output / "failure.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
