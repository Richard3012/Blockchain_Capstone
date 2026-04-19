import mongoose from 'mongoose'

const isSafeObjectId = (value) => {
  if (value === undefined || value === null) return false
  const str = String(value)
  if (str.length !== 24) return false
  return mongoose.Types.ObjectId.isValid(str)
}

/**
 * Reject malformed ids before they hit Mongoose queries (avoids CastError / log noise).
 * @param {string|string[]} paramNames - req.params keys to validate as ObjectIds
 */
export const validateObjectIdParams =
  (...paramNames) =>
    (req, res, next) => {
      for (const name of paramNames) {
        const raw = req.params[name]
        if (!isSafeObjectId(raw)) {
          return res.status(400).json({
            success: false,
            message: `Invalid identifier for ${name}`,
          })
        }
      }
      next()
    }
