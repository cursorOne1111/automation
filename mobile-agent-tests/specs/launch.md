# App 测试计划

1. APP-001 启动：连接设备，创建会话，确认目标 App 前台、页面树非空、截图有效。
2. APP-002 登录（接入业务后）：测试账号输入→点击登录→等待首页 accessibility ID。
3. 待接入：无效密码、退出登录、网络异常、权限弹窗、后台恢复、多分辨率。

APP-001 对应 tests/device/test_launch.py；APP-002 对应 tests/business/test_login.py。
其余场景尚未实现，不能计为已覆盖。登录后的状态清理由实际业务 fixture 实现，当前模板不适合直接并行运行。
