/**
 * Errors.gs — one error type with a stable code, so the front end
 * (and any later backend) can react to codes instead of messages.
 *
 * Codes: BAD_REQUEST, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND,
 *        VALIDATION, CONFLICT, BUSY, CONFIG, INTERNAL
 */
class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details || null;
  }
}
