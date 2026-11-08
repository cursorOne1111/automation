import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { TodoClient } from '../src/api/todo-client.js';
import { TodoPage } from '../src/pages/todo-page.js';

type Fixtures = { tenant: string; todos: TodoClient; todoPage: TodoPage };
export const test = base.extend<Fixtures>({
  tenant: async ({}, use) => { await use(randomUUID()); },
  todos: async ({ playwright, baseURL, tenant }, use) => {
    const context = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL ?? baseURL,
      extraHTTPHeaders: process.env.API_TOKEN ? { Authorization: `Bearer ${process.env.API_TOKEN}` } : {},
    });
    const client = new TodoClient(context, tenant);
    try { await use(client); }
    finally {
      try { expect((await client.clear()).status(), '清理测试租户').toBe(204); }
      finally { await context.dispose(); }
    }
  },
  todoPage: async ({ page, tenant, todos }, use) => {
    // 依赖 todos fixture，使 UI 创建的数据也得到清理。
    void todos;
    const todoPage = new TodoPage(page); await todoPage.open(tenant); await use(todoPage);
  },
});
export { expect };
