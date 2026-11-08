import { ProductsSchema } from '../../src/api/backend-client.js';
import { test, expect, expectError, orders, products, createOrder } from './fixtures.js';

test('BE-INPUT-001 商品分页契约、总数和空页语义', async ({ backend: { reader } }) => {
  const first = await reader.products({ offset: 0, limit: 1 }); expect(first.status()).toBe(200);
  expect(first.headers()['cache-control']).toBe('no-store');
  const page1 = ProductsSchema.parse(await first.json());
  expect(page1).toMatchObject({ total: 2, offset: 0, limit: 1 }); expect(page1.items).toHaveLength(1);
  const second = await reader.products({ offset: 1, limit: 1 }); expect(second.status()).toBe(200);
  const page2 = ProductsSchema.parse(await second.json()); expect(page2.items).toHaveLength(1);
  expect(page1.items[0].sku).not.toBe(page2.items[0].sku);
  const last = await reader.products({ offset: 2, limit: 1 }); expect(last.status()).toBe(200);
  expect(ProductsSchema.parse(await last.json())).toEqual({ items: [], total: 2, offset: 2, limit: 1 });
});

const invalidPages: Array<Record<string, string>> = [{ limit: '0' }, { limit: '101' }, { limit: '1.5' }, { offset: '-1' }, { offset: 'abc' }];
for (const params of invalidPages) {
  test(`BE-INPUT-002 非法分页 ${JSON.stringify(params)}`, async ({ backend: { reader } }) => {
    await expectError(await reader.products(params), 422, 'VALIDATION_ERROR');
  });
}

for (const quantity of [0, -1, 1.5, '1', null, 101]) {
  test(`BE-INPUT-003 非法数量 ${JSON.stringify(quantity)}`, async ({ backend: { admin } }) => {
    await expectError(await admin.createOrder({ sku: 'KB-001', quantity }), 422, 'VALIDATION_ERROR');
    expect((await orders(admin)).total).toBe(0);
    expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(5);
  });
}

for (const payload of [null, [], 'text', { quantity: 1 }, { sku: 'KB-001', quantity: 1, amountCents: 1 }]) {
  test(`BE-INPUT-004 拒绝错误结构及客户端伪造金额 ${JSON.stringify(payload)}`, async ({ backend: { admin } }) => {
    // 显式序列化以覆盖JSON的null/数组/字符串，而不是客户端编码差异。
    const response = await admin.request.post('/api/v1/orders', {
      headers: { ...admin.headers, 'idempotency-key': 'invalid-shape', 'content-type': 'application/json' }, data: Buffer.from(JSON.stringify(payload)),
    });
    await expectError(response, 422, 'VALIDATION_ERROR');
    expect((await orders(admin)).total).toBe(0);
  });
}

test('BE-INPUT-005 缺少幂等键拒绝写入', async ({ backend: { admin } }) => {
  const response = await admin.request.post('/api/v1/orders', { headers: admin.headers, data: { sku: 'KB-001', quantity: 1 } });
  await expectError(response, 400, 'INVALID_IDEMPOTENCY_KEY');
  expect((await orders(admin)).total).toBe(0);
});

test('BE-INPUT-006 畸形JSON返回400，服务继续可用', async ({ backend: { admin } }) => {
  const response = await admin.request.post('/api/v1/orders', {
    headers: { ...admin.headers, 'idempotency-key': 'broken-json', 'content-type': 'application/json' }, data: Buffer.from('{"sku":'),
  });
  await expectError(response, 400, 'INVALID_JSON');
  expect((await orders(admin)).total).toBe(0); expect((await products(admin)).total).toBe(2);
});

test('BE-INPUT-007 错误媒体类型返回415', async ({ backend: { admin } }) => {
  const response = await admin.request.post('/api/v1/orders', {
    headers: { ...admin.headers, 'idempotency-key': 'wrong-media', 'content-type': 'text/plain' }, data: 'test',
  });
  await expectError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
  expect((await orders(admin)).total).toBe(0);
});

test('BE-INPUT-008 超限请求体返回413且不创建订单', async ({ backend: { admin } }) => {
  await expectError(await admin.createOrder({ sku: 'x'.repeat(17000), quantity: 1 }), 413, 'PAYLOAD_TOO_LARGE');
  expect((await orders(admin)).total).toBe(0);
});

test('BE-INPUT-009 方法和路径错误返回405及404', async ({ backend: { admin } }) => {
  const method = await admin.request.put('/api/v1/orders', { headers: admin.headers });
  await expectError(method, 405, 'METHOD_NOT_ALLOWED'); expect(method.headers().allow).toBe('GET, POST');
  await expectError(await admin.request.get('/api/v1/missing', { headers: admin.headers }), 404, 'NOT_FOUND');
  await expectError(await admin.order('invalid-id'), 400, 'INVALID_ID');
});

for (const version of [0, 1.5, '1', null]) {
  test(`BE-INPUT-010 取消版本参数校验 ${JSON.stringify(version)}`, async ({ backend: { admin } }) => {
    const order = await createOrder(admin);
    await expectError(await admin.cancelOrder(order.id, version), 422, 'VALIDATION_ERROR');
    const response = await admin.order(order.id); expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(order);
    expect((await products(admin)).items.find(p => p.sku === 'KB-001')?.stock).toBe(4);
  });
}
