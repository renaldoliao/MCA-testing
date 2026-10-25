import type { SubmittedOrder, ChatMessage } from "@workspace/api-client-react";
export type { SubmittedOrder, ChatMessage };
const root = `${import.meta.env.BASE_URL}api`;
export class ServiceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function request<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(`${root}${path}`, {
    method: body === undefined ? "GET" : method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json", "X-MCA-Client": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new ServiceError("The shared API is not connected on this deployment. Nothing has been confirmed.", 503);
  const result = await response.json();
  if (!response.ok) throw new ServiceError(result.error || "Unable to save. Please retry.", response.status);
  return result;
}
let connection: Promise<void> | null = null;
export function connectCustomer(): Promise<void> {
  if (!connection) connection = request("/customer/session", {}).then(() => undefined).catch(error => { connection = null; throw error; });
  return connection;
}
export async function customerRequest<T>(path: string, body?: unknown): Promise<T> {
  await connectCustomer();
  try { return await request<T>(`/customer${path}`, body); }
  catch (error) {
    if (!(error instanceof ServiceError) || error.status !== 401) throw error;
    connection = null;
    await connectCustomer();
    return request<T>(`/customer${path}`, body);
  }
}
