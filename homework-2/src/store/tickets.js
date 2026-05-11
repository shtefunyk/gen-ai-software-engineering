const map = new Map();

export const ticketStore = {
  save(ticket) {
    map.set(ticket.id, ticket);
    return ticket;
  },
  get(id) {
    return map.get(id);
  },
  list() {
    return Array.from(map.values());
  },
  delete(id) {
    return map.delete(id);
  },
  reset() {
    map.clear();
  },
};
