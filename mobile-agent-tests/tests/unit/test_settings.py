import json
import pytest
from framework.settings import Settings

ENV_KEYS = ["MOBILE_PLATFORM", "APPIUM_URL", "CAPABILITIES_FILE", "DEVICE_NAME", "DEVICE_UDID",
            "PLATFORM_VERSION", "APP_PATH", "APP_PACKAGE", "APP_ACTIVITY", "APP_BUNDLE_ID"]


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_android_defaults():
    result = Settings.from_env()
    assert result.platform == "android"
    assert result.capabilities["appium:automationName"] == "UiAutomator2"
    assert result.capabilities["appium:appPackage"] == "com.android.settings"


def test_ios_and_udid_override(monkeypatch):
    monkeypatch.setenv("MOBILE_PLATFORM", "ios")
    monkeypatch.setenv("DEVICE_UDID", "test-simulator")
    result = Settings.from_env()
    assert result.capabilities["appium:automationName"] == "XCUITest"
    assert result.capabilities["appium:udid"] == "test-simulator"


def test_app_install_removes_demo_entry(monkeypatch, tmp_path):
    app = tmp_path / "sample.apk"
    app.touch()
    monkeypatch.setenv("APP_PATH", str(app))
    result = Settings.from_env()
    assert result.capabilities["appium:app"] == str(app)
    assert "appium:appPackage" not in result.capabilities
    assert "appium:appActivity" not in result.capabilities


def test_explicit_app_entry_preserved(monkeypatch, tmp_path):
    app = tmp_path / "sample.apk"; app.touch()
    monkeypatch.setenv("APP_PATH", str(app))
    monkeypatch.setenv("APP_PACKAGE", "example.app")
    assert Settings.from_env().capabilities["appium:appPackage"] == "example.app"


@pytest.mark.parametrize("platform", ["windows", "invalid"])
def test_invalid_platform(monkeypatch, platform):
    monkeypatch.setenv("MOBILE_PLATFORM", platform)
    with pytest.raises(ValueError, match="MOBILE_PLATFORM"):
        Settings.from_env()


@pytest.mark.parametrize("url", ["file:///tmp/test", "http://", "http://user:secret@localhost:4723"])
def test_invalid_server_url(monkeypatch, url):
    monkeypatch.setenv("APPIUM_URL", url)
    with pytest.raises(ValueError, match="APPIUM_URL"):
        Settings.from_env()


def test_missing_app(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_PATH", str(tmp_path / "missing.apk"))
    with pytest.raises(ValueError, match="APP_PATH"):
        Settings.from_env()


def test_platform_template_mismatch(monkeypatch, tmp_path):
    config = tmp_path / "bad.json"
    config.write_text(json.dumps({"platformName": "iOS", "appium:automationName": "XCUITest"}))
    monkeypatch.setenv("CAPABILITIES_FILE", str(config))
    with pytest.raises(ValueError, match="不匹配"):
        Settings.from_env()
