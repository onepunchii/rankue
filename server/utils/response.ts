import { Response } from "express";

export function sendSuccess(res: Response, data: any, status: number = 200) {
    return res.status(status).json({
        success: true,
        data
    });
}

export function sendError(res: Response, status: number, message: string, code?: string) {
    return res.status(status).json({
        success: false,
        message,
        code
    });
}
