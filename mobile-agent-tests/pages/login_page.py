import os
from appium.webdriver.common.appiumby import AppiumBy
from pages.base_page import BasePage


class LoginPage(BasePage):
    def locator(self, env):
        value = os.getenv(env)
        if not value:
            raise ValueError("请先在测试 App 中核实并配置 " + env)
        return (AppiumBy.ACCESSIBILITY_ID, value)

    def login(self, username, password):
        self.fill(self.locator("LOGIN_USERNAME_ID"), username)
        self.fill(self.locator("LOGIN_PASSWORD_ID"), password)
        self.tap(self.locator("LOGIN_SUBMIT_ID"))

    def wait_for_home(self):
        return self.visible(self.locator("LOGIN_SUCCESS_ID"))
