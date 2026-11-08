import { randomUUID } from 'node:crypto';
import { test as base, expect, type APIResponse } from '@playwright/test';
import { BackendClient, ErrorSchema, OrdersSchema, ProductsSchema, OrderSchema } from '../../src/api/backend-client.js';

export const test = base.extend<{ backend: { admin: BackendClient; reader: BackendClient } }>({
  backend: async ({ playwright, baseURL }, use) => {
    const context = await playwright.request.newContext({ baseURL, timeout: 10000 });
    const tenant = randomUUID();
    const admin = new BackendClient(context, tenant); const reader = new BackendClient(context, tenant);
    let authenticated = false;
    try {
      await admin.login(process.env.BACKEND_ADMIN_USERNAME ?? 'qa-admin', process.env.BACKEND_ADMIN_PASSWORD ?? 'demo-admin-password');
      authenticated = true;
      await reader.login(process.env.BACKEND_READER_USERNAME ?? 'qa-reader', process.env.BACKEND_READER_PASSWORD ?? 'demo-reader-password');
      await use({ admin, reader });
    } finally {
      try { if (authenticated) expect((await admin.clear()).status(), '清理后端测试租户与Token').toBe(204); }
      finally { await context.dispose(); }
    }
  },
});
export async function expectError(response: APIResponse, status: number, code: string) {
  expect(response.status()).toBe(status);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(ErrorSchema.parse(await response.json()).error.code).toBe(code);
}
export async function products(client: BackendClient) {
  const response = await client.products(); expect(response.status()).toBe(200);
  return ProductsSchema.parse(await response.json());
}
export async function orders(client: BackendClient) {
  const response = await client.orders(); expect(response.status()).toBe(200);
  return OrdersSchema.parse(await response.json());
}
export async function createOrder(client: BackendClient, quantity = 1) {
  const response = await client.createOrder({ sku: 'KB-001', quantity }); expect(response.status()).toBe(201);
  return OrderSchema.parse(await response.json());
}
export { expect };
