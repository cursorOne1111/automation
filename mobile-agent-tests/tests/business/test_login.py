import os
import pytest
from pages.login_page import LoginPage

pytestmark = [pytest.mark.device, pytest.mark.business]


def test_valid_login(driver):
    # 业务示例需要真实 App、测试账号与 accessibility ID，缺失时明确失败。
    username, password = os.getenv("TEST_USERNAME"), os.getenv("TEST_PASSWORD")
    assert username and password, "请配置测试环境 TEST_USERNAME / TEST_PASSWORD"
    page = LoginPage(driver)
    page.login(username, password)
    assert page.wait_for_home().is_displayed()
