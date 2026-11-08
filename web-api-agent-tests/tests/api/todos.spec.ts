import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures.js';
import { TodoSchema } from '../../src/api/todo-client.js';

test('API-001 创建、查询、完成任务，验证契约与状态持久化', async ({ todos }) => {
  const response = await todos.create('接口回归');
  expect(response.status()).toBe(201);
  const todo = TodoSchema.parse(await response.json());
  expect(todo).toMatchObject({ title: '接口回归', completed: false });
  const updated = await todos.complete(todo.id, true);
  expect(updated.status()).toBe(200);
  expect(TodoSchema.parse(await updated.json()).completed).toBe(true);
  const listed = await todos.list(); expect(listed.status()).toBe(200);
  expect(TodoSchema.array().parse(await listed.json())).toEqual([{ ...todo, completed: true }]);
});

for (const title of ['', '   ', 'x'.repeat(101), 123, null]) {
  test(`API-002 无效标题 ${JSON.stringify(title)}`, async ({ todos }) => {
    const response = await todos.create(title);
    expect(response.status()).toBe(422);
    expect(await response.json()).toEqual({ error: 'title must contain 1-100 characters' });
    expect(await (await todos.list()).json()).toEqual([]);
  });
}

test('API-003 不存在的任务返回 404', async ({ todos }) => {
  const response = await todos.complete(randomUUID(), true);
  expect(response.status()).toBe(404);
});

test('API-004 租户隔离', async ({ todos, request }) => {
  expect((await todos.create('私有任务')).status()).toBe(201);
  const otherTenant = randomUUID();
  try {
    const response = await request.get('/api/todos', { headers: { 'x-test-tenant': otherTenant } });
    expect(response.status()).toBe(200); expect(await response.json()).toEqual([]);
  } finally {
    expect((await request.delete('/api/todos', { headers: { 'x-test-tenant': otherTenant } })).status()).toBe(204);
  }
});

test('API-005 状态字段拒绝非布尔值', async ({ todos }) => {
  const created = await todos.create('字段验证'); expect(created.status()).toBe(201);
  const todo = TodoSchema.parse(await created.json());
  expect((await todos.complete(todo.id, 'true')).status()).toBe(422);
  expect(await (await todos.list()).json()).toEqual([todo]);
});

test('API-006 缺少租户返回 400', async ({ request }) => {
  const response = await request.get('/api/todos');
  expect(response.status()).toBe(400);
});
