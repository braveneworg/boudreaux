export async function extractFieldsWithValues<T extends Record<string, unknown>>(
  jsonPromise: Promise<T>
): Promise<Partial<T>> {
  const data = await jsonPromise;

  return Object.entries(data).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key as keyof T] = value as T[keyof T];
    }
    return acc;
  }, {} as Partial<T>);
}
