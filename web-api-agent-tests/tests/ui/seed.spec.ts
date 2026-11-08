import { test, expect } from '../fixtures.js';

// 提供给规划 Agent 的可运行探索入口。
test('seed: 本地应用可访问', async ({ todoPage, page }) => {
  void todoPage;
  await expect(page.getByRole('heading', { name: '待办事项' })).toBeVisible();
});
