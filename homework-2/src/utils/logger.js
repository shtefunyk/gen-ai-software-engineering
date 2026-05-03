function fmt(prefix, payload) {
  return `${prefix} ${JSON.stringify(payload)}`;
}

export const logger = {
  info: (prefix, payload) => console.log(fmt(prefix, payload)),
  warn: (prefix, payload) => console.warn(fmt(prefix, payload)),
  error: (prefix, payload) => console.error(fmt(prefix, payload)),
};
