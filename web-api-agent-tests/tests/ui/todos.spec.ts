import { test, expect } from '../fixtures.js';

test('UI-001 从界面创建任务并持久化完成状态', async ({ todoPage, page }) => {
  await todoPage.add('UI 自动化');
  const checkbox = todoPage.item('UI 自动化').getByRole('checkbox');
  const saved = page.waitForResponse(r => r.url().includes('/api/todos/') && r.request().method() === 'PATCH');
  await checkbox.check(); expect((await saved).status()).toBe(200);
  await page.reload(); await expect(checkbox).toBeChecked();
  await expect(page.getByLabel('任务名称', { exact: true })).toBeEmpty();
});

test('UI-002 接口准备数据，界面验证', async ({ todoPage, todos, page }) => {
  expect((await todos.create('接口造数')).status()).toBe(201);
  await page.reload(); await expect(todoPage.item('接口造数')).toBeVisible();
});

test('UI-003 服务异常时提示错误且不新增任务', async ({ todoPage, page }) => {
  await page.route('**/api/todos', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 503, json: { error: 'unavailable' } });
    else await route.continue();
  });
  await page.getByLabel('任务名称', { exact: true }).fill('失败任务');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('请求失败：503');
  await expect(page.getByTestId('todo-item')).toHaveCount(0);
});
