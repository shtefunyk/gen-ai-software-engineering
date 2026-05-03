const MAX = 5 * 1024 * 1024;

export function rawBodyParser(req, _res, next) {
  const ct = req.headers['content-type'] || '';
  if (
    !ct.includes('text/csv') &&
    !ct.includes('text/xml') &&
    !ct.includes('application/xml') &&
    !ct.includes('application/json')
  ) {
    return next();
  }
  let size = 0;
  let chunks = '';
  req.setEncoding('utf8');
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX) {
      req.destroy(new Error('Body too large'));
      return;
    }
    chunks += c;
  });
  req.on('end', () => {
    req.rawBody = chunks;
    next();
  });
  req.on('error', next);
}
