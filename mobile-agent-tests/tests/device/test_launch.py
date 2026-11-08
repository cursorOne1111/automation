import pytest
from selenium.webdriver.support.ui import WebDriverWait

pytestmark = pytest.mark.device


def test_app_launch(driver, mobile_settings):
    """真实设备烟测：会话有效、原生层级非空、目标应用在前台。"""
    assert driver.session_id
    WebDriverWait(driver, 15).until(lambda d: len(d.page_source) > 100)
    caps = mobile_settings.capabilities
    app_id = caps.get("appium:appPackage") or caps.get("appium:bundleId")
    if app_id:
        WebDriverWait(driver, 15).until(lambda d: int(d.query_app_state(app_id)) == 4)
    assert driver.get_screenshot_as_png().startswith(b"\x89PNG")
