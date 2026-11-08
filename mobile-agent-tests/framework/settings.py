"""环境变量覆盖平台模板；配置错误在创建远程会话前失败。"""
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]

@dataclass(frozen=True)
class Settings:
    platform: str
    server_url: str
    capabilities: Dict[str, Any]

    @classmethod
    def from_env(cls):
        platform = os.getenv("MOBILE_PLATFORM", "android").lower()
        if platform not in {"android", "ios"}:
            raise ValueError("MOBILE_PLATFORM 必须是 android 或 ios")
        path = Path(os.getenv("CAPABILITIES_FILE", str(ROOT / "config" / (platform + ".json"))))
        if not path.is_absolute():
            path = ROOT / path
        caps = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(caps, dict):
            raise ValueError("capabilities 必须是 JSON 对象")
        expected_name = "Android" if platform == "android" else "iOS"
        expected_driver = "UiAutomator2" if platform == "android" else "XCUITest"
        if caps.get("platformName") != expected_name or caps.get("appium:automationName") != expected_driver:
            raise ValueError("平台与 capabilities 的 platformName/automationName 不匹配")
        mapping = {
            "DEVICE_NAME": "appium:deviceName", "DEVICE_UDID": "appium:udid",
            "PLATFORM_VERSION": "appium:platformVersion",
            "APP_PACKAGE": "appium:appPackage", "APP_ACTIVITY": "appium:appActivity",
            "APP_BUNDLE_ID": "appium:bundleId",
        }
        for env, key in mapping.items():
            if os.getenv(env):
                caps[key] = os.environ[env]
        if os.getenv("APP_PATH"):
            app = Path(os.environ["APP_PATH"]).expanduser().resolve()
            if not app.exists():
                raise ValueError("APP_PATH 文件或 .app 目录不存在")
            caps["appium:app"] = str(app)
            # 安装包由驱动解析入口，避免模板中的系统设置覆盖真实 App。
            for key in ("appium:appPackage", "appium:appActivity", "appium:bundleId"):
                if key not in {mapping[e] for e in mapping if os.getenv(e)}:
                    caps.pop(key, None)
        url = os.getenv("APPIUM_URL", "http://127.0.0.1:4723")
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("APPIUM_URL 必须是无内嵌凭据的 http(s) URL")
        return cls(platform, url, caps)
