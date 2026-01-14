declare module 'prerender-node' {
    const prerender: any;
    export = prerender;
}

import "express-session";

declare module 'express-session' {
    interface SessionData {
        user: {
            id: string;
            [key: string]: any;
        };
        passport: {
            user: string;
        };
        isAdmin: boolean;
        adminUsername: string | null;
        grant: any;
    }
}
