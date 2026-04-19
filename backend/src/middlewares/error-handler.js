export const notFoundHandler = (req, _res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`)
  error.statusCode = 404
  next(error)
}

export const errorHandler = (error, _req, res, _next) => {
  // Handle Multer file upload errors with user-friendly messages
  if (error.name === 'MulterError' || error.code === 'LIMIT_FILE_SIZE') {
    const messages = {
      LIMIT_FILE_SIZE: 'File is too large. Maximum allowed size is 10 MB.',
      LIMIT_FILE_COUNT: 'Too many files uploaded.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field name.',
      LIMIT_PART_COUNT: 'Too many form fields.',
    }
    return res.status(413).json({
      success: false,
      message: messages[error.code] || `Upload error: ${error.message}`,
    })
  }

  // Handle unsupported file type errors from multer fileFilter
  if (error.message && error.message.startsWith('Unsupported file type:')) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }

  if (error.name === 'CastError' || String(error.message || '').includes('Cast to ObjectId')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid record identifier',
    })
  }

  const statusCode = error.statusCode || 500

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' ? { stack: error.stack } : {}),
  })
}
