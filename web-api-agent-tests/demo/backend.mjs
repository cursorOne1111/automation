import { randomUUID } from 'node:crypto';

// 仅用于本地协议与业务测试，账号、Token 和库存均为内存演示数据。
const accounts = {
  'qa-admin': { password: 'demo-admin-password', role: 'admin' },
  'qa-reader': { password: 'demo-reader-password', role: 'reader' },
};
const sessions = new Map();
const tenants = new Map();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class HttpError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const fail = (status, code, message) => { throw new HttpError(status, code, message); };
function send(res, status, data) {
  res.setHeader('cache-control', 'no-store');
  if (status === 204) { res.writeHead(status); return res.end(); }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
    fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'content-type must be application/json');
  }
  let bytes = 0; const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes <= 16384) chunks.push(chunk);
  }
  if (bytes > 16384) fail(413, 'PAYLOAD_TOO_LARGE', 'payload exceeds 16384 bytes');
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail(400, 'INVALID_JSON', 'request body is not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(422, 'VALIDATION_ERROR', 'request body must be an object');
  }
  return value;
}
function stateFor(tenant) {
  if (!tenants.has(tenant)) tenants.set(tenant, {
    products: new Map([
      ['KB-001', { sku: 'KB-001', name: 'Keyboard', priceCents: 1299, stock: 5 }],
      ['MS-001', { sku: 'MS-001', name: 'Mouse', priceCents: 499, stock: 10 }],
    ]), orders: new Map(), idempotency: new Map(),
  });
  return tenants.get(tenant);
}
function requireMethod(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader('allow', methods.join(', ')); fail(405, 'METHOD_NOT_ALLOWED', 'method is not supported');
  }
}
function sessionFor(req, tenant) {
  const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
  const session = token && sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) fail(401, 'UNAUTHORIZED', 'valid bearer token required');
  if (session.tenant !== tenant) fail(403, 'TENANT_FORBIDDEN', 'token does not belong to tenant');
  return { ...session, token };
}
function requireAdmin(session) {
  if (session.role !== 'admin') fail(403, 'FORBIDDEN', 'admin role required');
}
function pageValue(url, name, fallback, min, max) {
  const values = url.searchParams.getAll(name);
  if (!values.length) return fallback;
  if (values.length !== 1 || !/^\d+$/.test(values[0])) fail(422, 'VALIDATION_ERROR', `invalid ${name}`);
  const value = Number(values[0]);
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(422, 'VALIDATION_ERROR', `invalid ${name}`);
  return value;
}

export async function handleBackend(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const tenant = req.headers['x-test-tenant'];
    if (typeof tenant !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(tenant)) {
      fail(400, 'INVALID_TENANT', 'valid x-test-tenant required');
    }
    if (path === '/api/v1/auth/token') {
      requireMethod(req, res, ['POST']);
      const input = await body(req);
      if (typeof input.username !== 'string' || typeof input.password !== 'string') {
        fail(422, 'VALIDATION_ERROR', 'username and password must be strings');
      }
      const account = Object.hasOwn(accounts, input.username) ? accounts[input.username] : undefined;
      if (!account || input.password !== account.password) fail(401, 'INVALID_CREDENTIALS', 'invalid credentials');
      const accessToken = randomUUID();
      sessions.set(accessToken, { tenant, role: account.role, expiresAt: Date.now() + 3600000 });
      return send(res, 200, { accessToken, tokenType: 'Bearer', expiresIn: 3600, role: account.role });
    }
    const session = sessionFor(req, tenant);
    if (path === '/api/v1/auth/logout') {
      requireMethod(req, res, ['POST']); sessions.delete(session.token); return send(res, 204);
    }
    if (path === '/api/v1/test-data') {
      requireMethod(req, res, ['DELETE']); requireAdmin(session); tenants.delete(tenant);
      for (const [key, value] of sessions) if (value.tenant === tenant) sessions.delete(key);
      return send(res, 204);
    }
    if (path === '/api/v1/products') {
      requireMethod(req, res, ['GET']);
      const offset = pageValue(url, 'offset', 0, 0, 1000000);
      const limit = pageValue(url, 'limit', 20, 1, 100);
      const products = [...stateFor(tenant).products.values()];
      return send(res, 200, { items: products.slice(offset, offset + limit), total: products.length, offset, limit });
    }
    if (path === '/api/v1/orders') {
      requireMethod(req, res, ['GET', 'POST']);
      if (req.method === 'GET') {
        const orders = [...stateFor(tenant).orders.values()];
        return send(res, 200, { items: orders, total: orders.length });
      }
      requireAdmin(session);
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(key)) {
        fail(400, 'INVALID_IDEMPOTENCY_KEY', 'valid idempotency-key required');
      }
      const input = await body(req);
      if (Object.keys(input).some(k => !['sku', 'quantity'].includes(k)) ||
          typeof input.sku !== 'string' || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
        fail(422, 'VALIDATION_ERROR', 'sku and integer quantity from 1 to 100 required');
      }
      const state = stateFor(tenant);
      const fingerprint = JSON.stringify({ sku: input.sku, quantity: input.quantity });
      const prior = state.idempotency.get(key);
      if (prior) {
        if (prior.fingerprint !== fingerprint) fail(409, 'IDEMPOTENCY_CONFLICT', 'idempotency-key already used with different payload');
        return send(res, 200, prior.response);
      }
      const product = state.products.get(input.sku);
      if (!product) fail(404, 'PRODUCT_NOT_FOUND', 'product not found');
      // 校验、扣减、建单与保存幂等结果之间没有 await，仅保证单进程内的临界区。
      if (product.stock < input.quantity) fail(409, 'INSUFFICIENT_STOCK', 'insufficient stock');
      product.stock -= input.quantity;
      const order = { id: randomUUID(), sku: product.sku, quantity: input.quantity,
        amountCents: product.priceCents * input.quantity, status: 'created', version: 1 };
      state.orders.set(order.id, order);
      state.idempotency.set(key, { fingerprint, response: { ...order } });
      return send(res, 201, order);
    }
    const match = path.match(/^\/api\/v1\/orders\/([^/]+)(\/cancel)?$/);
    if (match) {
      requireMethod(req, res, match[2] ? ['POST'] : ['GET']);
      if (match[2]) requireAdmin(session);
      if (!uuid.test(match[1])) fail(400, 'INVALID_ID', 'order id must be a UUID');
      const state = stateFor(tenant); const order = state.orders.get(match[1]);
      if (!order) fail(404, 'ORDER_NOT_FOUND', 'order not found');
      if (!match[2]) return send(res, 200, order);
      const input = await body(req);
      // body() 后重新读取版本，防止并发取消使用读取前的旧状态。
      const current = state.orders.get(order.id);
      if (!Number.isSafeInteger(input.version) || input.version < 1 || Object.keys(input).some(k => k !== 'version')) {
        fail(422, 'VALIDATION_ERROR', 'positive integer version required');
      }
      if (input.version !== current.version) fail(409, 'VERSION_CONFLICT', 'order version changed');
      if (current.status !== 'created') fail(409, 'INVALID_ORDER_STATE', 'order is already cancelled');
      const cancelled = { ...current, status: 'cancelled', version: current.version + 1 };
      state.orders.set(order.id, cancelled); state.products.get(current.sku).stock += current.quantity;
      return send(res, 200, cancelled);
    }
    fail(404, 'NOT_FOUND', 'endpoint not found');
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: { code: error.code, message: error.message } });
    send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'internal error' } });
  }
}
