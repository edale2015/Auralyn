export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = "ApiError"
  }

  toJSON() {
    return { ok: false, error: this.message, code: this.code ?? null, status: this.statusCode }
  }

  static badRequest(msg: string, code?: string) { return new ApiError(400, msg, code) }
  static unauthorized(msg = "Unauthorized") { return new ApiError(401, msg, "UNAUTHORIZED") }
  static forbidden(msg = "Forbidden") { return new ApiError(403, msg, "FORBIDDEN") }
  static notFound(msg = "Not found") { return new ApiError(404, msg, "NOT_FOUND") }
  static conflict(msg: string) { return new ApiError(409, msg, "CONFLICT") }
  static internal(msg = "Internal server error") { return new ApiError(500, msg, "INTERNAL") }
}
