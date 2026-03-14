import { Request, Response, NextFunction } from "express"
import { ZodSchema } from "zod"
import { ApiError } from "../lib/apiError"

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return next(ApiError.badRequest(result.error.errors.map((e) => e.message).join("; "), "VALIDATION_FAILED"))
    }
    req.body = result.data
    next()
  }
}
