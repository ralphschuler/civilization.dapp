const primitive = (value) => (
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
    ? value
    : undefined
);

function primitiveDescriptorValue(candidate, field) {
  const visited = new Set();
  let current = candidate;
  while (current && !visited.has(current)) {
    visited.add(current);
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, field);
    } catch {
      return undefined;
    }
    if (descriptor) return 'value' in descriptor ? primitive(descriptor.value) : undefined;
    try {
      current = Object.getPrototypeOf(current);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Copies the documented native result without invoking unknown getters. */
export function normalizeNativeWalletAuthResult(result) {
  if (!result || typeof result !== 'object') return { value: primitive(result) ?? String(result) };
  const normalized = {};
  const executedWith = primitiveDescriptorValue(result, 'executedWith');
  if (executedWith !== undefined) normalized.executedWith = executedWith;

  const dataDescriptor = Object.getOwnPropertyDescriptor(result, 'data');
  const data = dataDescriptor && 'value' in dataDescriptor ? dataDescriptor.value : undefined;
  if (data && typeof data === 'object') {
    const normalizedData = {};
    for (const field of ['status', 'version', 'address', 'message', 'signature', 'error_code', 'details']) {
      const value = primitiveDescriptorValue(data, field);
      if (value !== undefined) normalizedData[field] = value;
    }
    normalized.data = normalizedData;
  } else if (data !== undefined) {
    normalized.data = primitive(data) ?? String(data);
  }
  return normalized;
}

/** Keeps useful, safe-to-render error metadata while deliberately excluding stacks. */
export function normalizeNativeWalletAuthError(error) {
  if (typeof error === 'string') return { name: 'Error', message: error };
  if (!error || typeof error !== 'object') return { name: 'Error', message: String(error) };

  const candidate = error;
  const normalized = {};
  for (const field of ['name', 'message', 'code', 'reason', 'details']) {
    const value = primitiveDescriptorValue(candidate, field);
    if (value !== undefined) normalized[field] = value;
  }
  return Object.keys(normalized).length > 0 ? normalized : { name: 'Error', message: 'Unknown error' };
}
