export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body)

  if (!result.success) {
    const error = new Error(result.error.issues.map((issue) => issue.message).join(', '))
    error.statusCode = 400
    throw error
  }

  req.body = result.data
  next()
}
