/** Respuesta estándar del API: { status_code, message, data } (0 = ok, 1 = regla de negocio, 2 = error). */
export interface ApiResponse<T = any> {
  status_code: number;
  message: string;
  data: T;
}
