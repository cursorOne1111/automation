import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';

export const TodoSchema = z.object({
  id: z.string().uuid(), title: z.string().min(1).max(100), completed: z.boolean(),
}).strict();

export class TodoClient {
  constructor(private readonly request: APIRequestContext, private readonly tenant: string) {}
  private get headers() { return { 'x-test-tenant': this.tenant }; }
  list() { return this.request.get('/api/todos', { headers: this.headers }); }
  create(title: unknown) {
    return this.request.post('/api/todos', { headers: this.headers, data: { title } });
  }
  complete(id: string, completed: unknown) {
    return this.request.patch(`/api/todos/${id}`, { headers: this.headers, data: { completed } });
  }
  clear() { return this.request.delete('/api/todos', { headers: this.headers }); }
}
