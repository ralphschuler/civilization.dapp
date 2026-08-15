/** Converts an unavailable schema check into a not-ready result without changing false. */
export async function resolveSchemaReadiness(check) {
  try {
    return await check();
  } catch {
    return false;
  }
}
