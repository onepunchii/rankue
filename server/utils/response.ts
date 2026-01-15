
import { Response } from "express";

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: {
        code: string;
        details?: any;
    };
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        [key: string]: any;
    };
}

export const sendSuccess = <T>(res: Response, data: T, message?: string, meta?: any) => {
    const response: ApiResponse<T> = {
        success: true,
        data,
        message,
        meta
    };
    return res.json(response);
};

export const sendError = (res: Response, statusCode: number, message: string, code: string = "INTERNAL_ERROR", details?: any) => {
    const response: ApiResponse = {
        success: false,
        message,
        error: {
            code,
            details
        }
    };
    return res.status(statusCode).json(response);
};
