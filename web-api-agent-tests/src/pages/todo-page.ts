import { expect, type Page } from '@playwright/test';

export class TodoPage {
  constructor(readonly page: Page) {}
  async open(tenant: string) { await this.page.goto(`/?tenant=${encodeURIComponent(tenant)}`); }
  async add(title: string) {
    await this.page.getByLabel('任务名称', { exact: true }).fill(title);
    await this.page.getByRole('button', { name: '添加', exact: true }).click();
    await expect(this.item(title)).toBeVisible();
  }
  item(title: string) { return this.page.getByTestId('todo-item').filter({ hasText: title }); }
}
