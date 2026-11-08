import { randomUUID } from 'node:crypto';
import { BackendClient, OrderSchema } from '../../src/api/backend-client.js';
import { test, expect, expectError, createOrder, orders, products } from './fixtures.js';

test('BE-ORDER-001 创建、查询、取消，验证金额库存与状态持久化', async ({ backend: { admin } }) => {
  const created = await createOrder(admin, 2);
  expect(created).toMatchObject({ sku: 'KB-001', quantity: 2, amountCents: 2598, status: 'created', version: 1 });
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(3);
  const read = await admin.order(created.id); expect(read.status()).toBe(200);
  expect(OrderSchema.parse(await read.json())).toEqual(created);
  const cancelled = await admin.cancelOrder(created.id, created.version); expect(cancelled.status()).toBe(200);
  const expected = { ...created, status: 'cancelled', version: 2 };
  expect(OrderSchema.parse(await cancelled.json())).toEqual(expected);
  const persisted = await admin.order(created.id); expect(persisted.status()).toBe(200);
  expect(await persisted.json()).toEqual(expected);
  expect((await orders(admin)).items).toEqual([expected]);
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(5);
});

test('BE-ORDER-002 库存不足不创建订单且不扣库存', async ({ backend: { admin } }) => {
  await expectError(await admin.createOrder({ sku: 'KB-001', quantity: 6 }), 409, 'INSUFFICIENT_STOCK');
  expect((await orders(admin)).total).toBe(0);
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(5);
});

test('BE-ORDER-003 幂等重放返回原始结果且不重复扣库存', async ({ backend: { admin } }) => {
  const key = randomUUID(); const payload = { sku: 'KB-001', quantity: 2 };
  const first = await admin.createOrder(payload, key); expect(first.status()).toBe(201);
  const original = OrderSchema.parse(await first.json());
  const replay = await admin.createOrder(payload, key); expect(replay.status()).toBe(200);
  expect(OrderSchema.parse(await replay.json())).toEqual(original);
  expect((await orders(admin)).total).toBe(1);
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(3);
});

test('BE-ORDER-004 同一幂等键不同参数返回409且无额外副作用', async ({ backend: { admin } }) => {
  const key = randomUUID();
  expect((await admin.createOrder({ sku: 'KB-001', quantity: 1 }, key)).status()).toBe(201);
  await expectError(await admin.createOrder({ sku: 'KB-001', quantity: 2 }, key), 409, 'IDEMPOTENCY_CONFLICT');
  expect((await orders(admin)).total).toBe(1);
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(4);
});

test('BE-ORDER-005 旧版本取消失败，正确版本可取消，重复取消不重复回补', async ({ backend: { admin } }) => {
  const order = await createOrder(admin, 2);
  await expectError(await admin.cancelOrder(order.id, 2), 409, 'VERSION_CONFLICT');
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(3);
  const unchanged = await admin.order(order.id); expect(unchanged.status()).toBe(200);
  expect(await unchanged.json()).toEqual(order);
  expect((await admin.cancelOrder(order.id, 1)).status()).toBe(200);
  await expectError(await admin.cancelOrder(order.id, 2), 409, 'INVALID_ORDER_STATE');
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(5);
});

test('BE-ORDER-006 跨租户无法查询已知订单ID', async ({ backend: { admin } }) => {
  const order = await createOrder(admin);
  const other = new BackendClient(admin.request, randomUUID());
  await other.login(process.env.BACKEND_ADMIN_USERNAME ?? 'qa-admin', process.env.BACKEND_ADMIN_PASSWORD ?? 'demo-admin-password');
  try {
    await expectError(await other.order(order.id), 404, 'ORDER_NOT_FOUND');
    expect((await orders(other)).items).toEqual([]);
    expect((await products(other)).items.find(p => p.sku === 'KB-001')?.stock).toBe(5);
  } finally { expect((await other.clear()).status()).toBe(204); }
});

test('BE-ORDER-007 不存在的商品和订单返回404', async ({ backend: { admin } }) => {
  await expectError(await admin.createOrder({ sku: 'MISSING-SKU', quantity: 1 }), 404, 'PRODUCT_NOT_FOUND');
  await expectError(await admin.order(randomUUID()), 404, 'ORDER_NOT_FOUND');
  expect((await orders(admin)).total).toBe(0);
});

test('BE-ORDER-008 并发抢购不超卖，成功订单数和库存守恒', async ({ backend: { admin } }) => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => admin.createOrder({ sku: 'KB-001', quantity: 1 })));
  expect(responses.filter(r => r.status() === 201)).toHaveLength(5);
  expect(responses.filter(r => r.status() === 409)).toHaveLength(3);
  const successful = [];
  for (const response of responses) {
    if (response.status() === 201) successful.push(OrderSchema.parse(await response.json()));
    else await expectError(response, 409, 'INSUFFICIENT_STOCK');
  }
  expect(new Set(successful.map(o => o.id)).size).toBe(5);
  const remaining = (await products(admin)).items.find(p => p.sku === 'KB-001')!.stock;
  const persisted = await orders(admin); expect(persisted.total).toBe(5);
  expect(remaining + persisted.items.reduce((sum, o) => sum + o.quantity, 0)).toBe(5);
  expect(remaining).toBe(0);
});

test('BE-ORDER-009 并发相同幂等键只创建一次', async ({ backend: { admin } }) => {
  const key = randomUUID();
  const responses = await Promise.all(Array.from({ length: 6 }, () => admin.createOrder({ sku: 'KB-001', quantity: 1 }, key)));
  expect(responses.filter(r => r.status() === 201)).toHaveLength(1);
  expect(responses.filter(r => r.status() === 200)).toHaveLength(5);
  const results = await Promise.all(responses.map(async r => OrderSchema.parse(await r.json())));
  expect(new Set(results.map(o => o.id)).size).toBe(1);
  expect((await orders(admin)).total).toBe(1);
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(4);
});

test('BE-ORDER-010 并发取消同一版本只回补一次库存', async ({ backend: { admin } }) => {
  const order = await createOrder(admin, 2);
  const responses = await Promise.all([admin.cancelOrder(order.id, 1), admin.cancelOrder(order.id, 1)]);
  expect(responses.map(r => r.status()).sort()).toEqual([200, 409]);
  const conflict = responses.find(r => r.status() === 409)!;
  await expectError(conflict, 409, 'VERSION_CONFLICT');
  const result = await admin.order(order.id); expect(result.status()).toBe(200);
  expect(OrderSchema.parse(await result.json())).toMatchObject({ status: 'cancelled', version: 2 });
  expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(5);
});
