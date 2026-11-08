from appium import webdriver
from appium.options.android import UiAutomator2Options
from appium.options.ios import XCUITestOptions
from framework.settings import Settings


def create_driver(settings: Settings):
    options = UiAutomator2Options() if settings.platform == "android" else XCUITestOptions()
    options.load_capabilities(settings.capabilities)
    driver = webdriver.Remote(command_executor=settings.server_url, options=options)
    # 使用显式等待；不与隐式等待叠加。
    driver.implicitly_wait(0)
    return driver
