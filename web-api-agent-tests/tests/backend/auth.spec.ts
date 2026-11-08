import { randomUUID } from 'node:crypto';
import { BackendClient, TokenSchema } from '../../src/api/backend-client.js';
import { test, expect, expectError, orders, products, createOrder } from './fixtures.js';

test('BE-AUTH-001 登录返回Token契约与角色', async ({ backend }) => {
  const token = await backend.reader.login(process.env.BACKEND_READER_USERNAME ?? 'qa-reader', process.env.BACKEND_READER_PASSWORD ?? 'demo-reader-password');
  expect(TokenSchema.parse(token)).toMatchObject({ role: 'reader', tokenType: 'Bearer', expiresIn: 3600 });
  expect((await backend.reader.products()).status()).toBe(200);
});

for (const authorization of [undefined, 'Bearer invalid-token', 'Basic abc', 'Bearer']) {
  test(`BE-AUTH-002 拒绝无效鉴权 ${authorization ?? 'missing'}`, async ({ backend }) => {
    const response = await backend.admin.request.get('/api/v1/products', {
      headers: { 'x-test-tenant': backend.admin.tenant, ...(authorization ? { Authorization: authorization } : {}) },
    });
    await expectError(response, 401, 'UNAUTHORIZED');
  });
}

for (const credentials of [
  { username: 'qa-admin', password: 'wrong-password' },
  { username: 'unknown-user', password: 'demo-admin-password' },
]) {
  test(`BE-AUTH-003 错误凭据 ${credentials.username}`, async ({ backend }) => {
    const response = await backend.admin.request.post('/api/v1/auth/token', {
      headers: { 'x-test-tenant': backend.admin.tenant }, data: credentials,
    });
    await expectError(response, 401, 'INVALID_CREDENTIALS');
    expect(await response.text()).not.toContain(credentials.password);
  });
}

test('BE-AUTH-004 只读用户不能创建订单或清理数据', async ({ backend }) => {
  await expectError(await backend.reader.createOrder({ sku: 'KB-001', quantity: 1 }), 403, 'FORBIDDEN');
  await expectError(await backend.reader.clear(), 403, 'FORBIDDEN');
  expect((await orders(backend.admin)).total).toBe(0);
  expect((await products(backend.admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(5);
});

test('BE-AUTH-005 Token不能通过修改租户头越权', async ({ backend }) => {
  const response = await backend.admin.request.get('/api/v1/orders', {
    headers: { ...backend.admin.headers, 'x-test-tenant': randomUUID() },
  });
  await expectError(response, 403, 'TENANT_FORBIDDEN');
});

test('BE-AUTH-006 注销后Token立即失效，204无响应体', async ({ backend }) => {
  const response = await backend.reader.logout();
  expect(response.status()).toBe(204); expect(await response.body()).toHaveLength(0);
  await expectError(await backend.reader.products(), 401, 'UNAUTHORIZED');
});

test('BE-AUTH-007 缺少租户头拒绝请求', async ({ backend }) => {
  const response = await backend.admin.request.get('/api/v1/products', { headers: { Authorization: backend.admin.headers.Authorization } });
  await expectError(response, 400, 'INVALID_TENANT');
});

test('BE-AUTH-008 用户名或密码缺少时返回字段错误', async ({ backend }) => {
  const response = await backend.admin.request.post('/api/v1/auth/token', {
    headers: { 'x-test-tenant': backend.admin.tenant }, data: { username: 'qa-admin' },
  });
  await expectError(response, 422, 'VALIDATION_ERROR');
});

test('BE-AUTH-009 只读用户不能取消订单', async ({ backend }) => {
  const order = await createOrder(backend.admin);
  await expectError(await backend.reader.cancelOrder(order.id, 1), 403, 'FORBIDDEN');
  const persisted = await backend.admin.order(order.id); expect(persisted.status()).toBe(200);
  expect(await persisted.json()).toEqual(order);
  expect((await products(backend.admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(4);
});

test('BE-AUTH-010 清理数据同时撤销租户Token，重新登录回到初始数据', async ({ backend }) => {
  await createOrder(backend.admin);
  const cleaned = await backend.admin.clear(); expect(cleaned.status()).toBe(204);
  expect(await cleaned.body()).toHaveLength(0);
  await expectError(await backend.admin.orders(), 401, 'UNAUTHORIZED');
  await expectError(await backend.reader.products(), 401, 'UNAUTHORIZED');
  await backend.admin.login(process.env.BACKEND_ADMIN_USERNAME ?? 'qa-admin', process.env.BACKEND_ADMIN_PASSWORD ?? 'demo-admin-password');
  expect((await orders(backend.admin)).total).toBe(0);
  expect((await products(backend.admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(5);
});
