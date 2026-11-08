from unittest.mock import Mock, patch
import pytest
from framework.driver import create_driver
from framework.settings import Settings


@pytest.mark.parametrize("platform,automation", [("android", "UiAutomator2"), ("ios", "XCUITest")])
def test_remote_receives_w3c_capabilities(platform, automation):
    caps = {"platformName": "Android" if platform == "android" else "iOS", "appium:automationName": automation}
    settings = Settings(platform, "http://127.0.0.1:4723", caps)
    with patch("framework.driver.webdriver.Remote", return_value=Mock()) as remote:
        driver = create_driver(settings)
    assert remote.call_args.kwargs["options"].to_capabilities()["appium:automationName"] == automation
    assert remote.call_args.kwargs["command_executor"] == settings.server_url
    driver.implicitly_wait.assert_called_once_with(0)
