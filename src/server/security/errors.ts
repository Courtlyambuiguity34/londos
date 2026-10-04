export class AccessError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404 | 409 | 422 | 429,
    public readonly code: string,
  ) {
    super(code);
  }
}
