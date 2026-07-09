/**
 * AppError — a business/domain error that carries an HTTP status.
 *
 * The central asyncHandler reads `error.statusCode` to choose the response status,
 * so throwing AppError lets storage/service code surface client-correctable
 * conditions (room full, already joined, wrong password, not found) as proper 4xx
 * responses instead of a generic 500. The `.message` is preserved verbatim, so any
 * route-level `catch (err) { if (err.message === "...") }` translation still works.
 */
export class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
    }
}

export const badRequest = (message: string) => new AppError(message, 400);
export const unauthorized = (message: string) => new AppError(message, 401);
export const notFound = (message: string) => new AppError(message, 404);
export const conflict = (message: string) => new AppError(message, 409);
