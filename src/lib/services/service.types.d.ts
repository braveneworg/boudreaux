// Define your return types
export type ServiceResponse<T> = { success: true; data: T } | { success: false; error: string };
