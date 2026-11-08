import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

export const ErrorSchema = z.object({ error: z.object({ code: z.string().min(1), message: z.string().min(1) }).strict() }).strict();
export const TokenSchema = z.object({ accessToken: z.string().min(1), tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(), role: z.enum(['admin', 'reader']) }).strict();
export const ProductSchema = z.object({ sku: z.string(), name: z.string(), priceCents: z.number().int().positive(),
  stock: z.number().int().nonnegative() }).strict();
export const ProductsSchema = z.object({ items: ProductSchema.array(), total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(), limit: z.number().int().positive() }).strict();
export const OrderSchema = z.object({ id: z.string().uuid(), sku: z.string(), quantity: z.number().int().positive(),
  amountCents: z.number().int().positive(), status: z.enum(['created', 'cancelled']), version: z.number().int().positive() }).strict();
export const OrdersSchema = z.object({ items: OrderSchema.array(), total: z.number().int().nonnegative() }).strict();

export class BackendClient {
  private token?: string;
  constructor(readonly request: APIRequestContext, readonly tenant: string) {}
  get headers(): Record<string, string> {
    return { 'x-test-tenant': this.tenant, ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) };
  }
  async login(username: string, password: string) {
    const response = await this.request.post('/api/v1/auth/token', { headers: { 'x-test-tenant': this.tenant }, data: { username, password } });
    if (response.status() !== 200) throw new Error(`登录失败，HTTP ${response.status()}；请检查测试账号配置`);
    const token = TokenSchema.parse(await response.json()); this.token = token.accessToken; return token;
  }
  products(params: Record<string, string | number> = {}) {
    return this.request.get('/api/v1/products', { headers: this.headers, params });
  }
  orders() { return this.request.get('/api/v1/orders', { headers: this.headers }); }
  order(id: string) { return this.request.get(`/api/v1/orders/${id}`, { headers: this.headers }); }
  createOrder(data: unknown, key = randomUUID()) {
    return this.request.post('/api/v1/orders', { headers: { ...this.headers, 'idempotency-key': key }, data });
  }
  cancelOrder(id: string, version: unknown) {
    return this.request.post(`/api/v1/orders/${id}/cancel`, { headers: this.headers, data: { version } });
  }
  logout() { return this.request.post('/api/v1/auth/logout', { headers: this.headers }); }
  clear() { return this.request.delete('/api/v1/test-data', { headers: this.headers }); }
}
