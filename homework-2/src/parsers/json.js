export function parseJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('JSON root must be an array of tickets');
  }
  return data;
}
