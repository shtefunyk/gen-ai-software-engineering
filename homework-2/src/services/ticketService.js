import { randomUUID } from 'node:crypto';
import { ticketStore } from '../store/tickets.js';

function nowIso() {
  return new Date().toISOString();
}

function newTicket(input) {
  const ts = nowIso();
  return {
    id: randomUUID(),
    customer_id: input.customer_id,
    customer_email: input.customer_email,
    customer_name: input.customer_name,
    subject: input.subject,
    description: input.description,
    category: input.category ?? 'other',
    priority: input.priority ?? 'medium',
    status: input.status ?? 'new',
    created_at: ts,
    updated_at: ts,
    resolved_at: null,
    assigned_to: input.assigned_to ?? null,
    tags: input.tags ?? [],
    metadata: { ...input.metadata },
  };
}

export const ticketService = {
  create(input) {
    return ticketStore.save(newTicket(input));
  },

  get(id) {
    return ticketStore.get(id);
  },

  list(filters = {}) {
    let items = ticketStore.list();
    const { category, priority, status, assigned_to, tag, from, to } = filters;
    if (category) items = items.filter((t) => t.category === category);
    if (priority) items = items.filter((t) => t.priority === priority);
    if (status) items = items.filter((t) => t.status === status);
    if (assigned_to) items = items.filter((t) => t.assigned_to === assigned_to);
    if (tag) items = items.filter((t) => Array.isArray(t.tags) && t.tags.includes(tag));
    if (from) items = items.filter((t) => t.created_at >= from);
    if (to) items = items.filter((t) => t.created_at <= to);
    return items;
  },

  update(id, patch) {
    const existing = ticketStore.get(id);
    if (!existing) return null;
    const merged = {
      ...existing,
      ...patch,
      metadata: patch.metadata ? { ...existing.metadata, ...patch.metadata } : existing.metadata,
      updated_at: nowIso(),
    };
    if (patch.status === 'resolved' && !existing.resolved_at) {
      merged.resolved_at = merged.updated_at;
    }
    return ticketStore.save(merged);
  },

  remove(id) {
    return ticketStore.delete(id);
  },
};
