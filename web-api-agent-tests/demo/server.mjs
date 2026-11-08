import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// 每个测试使用独立租户，不提供全局 reset，避免并行用例相互污染。
const tenants = new Map();
const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
async function readJSON(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16384) throw new Error('body too large');
  }
  return JSON.parse(body || '{}');
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return send(res, 200, { status: 'ok' });
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await readFile(new URL('./index.html', import.meta.url)));
    }
    if (!url.pathname.startsWith('/api/todos')) return send(res, 404, { error: 'not found' });
    const tenant = req.headers['x-test-tenant'];
    if (typeof tenant !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(tenant)) {
      return send(res, 400, { error: 'x-test-tenant required' });
    }
    if (url.pathname === '/api/todos' && req.method === 'DELETE') {
      tenants.delete(tenant);
      res.writeHead(204); return res.end();
    }
    if (!tenants.has(tenant)) tenants.set(tenant, new Map());
    const todos = tenants.get(tenant);
    if (url.pathname === '/api/todos' && req.method === 'GET') return send(res, 200, [...todos.values()]);
    if (url.pathname === '/api/todos' && req.method === 'POST') {
      const { title } = await readJSON(req);
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 100) {
        return send(res, 422, { error: 'title must contain 1-100 characters' });
      }
      const todo = { id: randomUUID(), title: title.trim(), completed: false };
      todos.set(todo.id, todo); return send(res, 201, todo);
    }
    const match = url.pathname.match(/^\/api\/todos\/([a-f0-9-]+)$/);
    if (match && req.method === 'PATCH') {
      const todo = todos.get(match[1]);
      if (!todo) return send(res, 404, { error: 'todo not found' });
      const { completed } = await readJSON(req);
      if (typeof completed !== 'boolean') return send(res, 422, { error: 'completed must be boolean' });
      todo.completed = completed; return send(res, 200, todo);
    }
    return send(res, 404, { error: 'not found' });
  } catch (error) {
    if (error instanceof SyntaxError || error.message === 'body too large') {
      return send(res, 400, { error: 'invalid JSON or payload too large' });
    }
    send(res, 500, { error: 'internal error' });
  }
});
server.listen(Number(process.env.DEMO_PORT ?? 3100), '127.0.0.1', () => console.log('QA demo ready'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
