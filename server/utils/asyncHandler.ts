import { Request, Response, NextFunction } from "express";

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
        console.error("[AsyncError]", error);

        // If response already sent, don't try to send again
        if (res.headersSent) {
            return next(error);
        }

        const status = (error as any).statusCode || (error as any).status || 500;
        const message = error.message || "서버 내부 오류";

        res.status(status).json({
            success: false,
            message: status === 500 && process.env.NODE_ENV === 'production'
                ? "서버 내부 오류가 발생했습니다."
                : message
        });
    });
};
