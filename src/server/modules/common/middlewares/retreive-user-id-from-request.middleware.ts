import { Injectable, NestMiddleware, MiddlewareFunction } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { SecurityService } from '../security/security.service';
import { AuthService } from '../../auth/auth.service';

@Injectable()
export class RetrieveUserIdFromRequestMiddleware implements NestMiddleware {
    useSecure: boolean = process.env.SESSION_ID_SECURE_COOKIE === 'true';

    constructor(private readonly securityService: SecurityService, private readonly authService: AuthService) {}
    async resolve(): Promise<MiddlewareFunction> {
        return async (req: Request, res: Response, next: NextFunction) => {
            const jwt = req.cookies['SESSIONID'];
            if (jwt) {
                try {
                    const payload = await this.securityService.decodeJwt(jwt);
                    if (payload.exp * 1000 - Date.now() < 1) {
                        const canCreateNewSession = await this.securityService.checkRefreshToken(payload.refreshToken, payload.sub);
                        if (!canCreateNewSession) {
                            console.log(
                                `create new session check failed.
                                refresh token too old or removed from db.
                                removing their authorizing cookies.`
                            );
                            res.clearCookie('SESSIONID');
                            res.clearCookie('XSRF-TOKEN');
                            return res.sendStatus(403);
                        }

                        const sessionToken = await this.securityService.createSessionToken({
                            roles: payload.roles,
                            id: payload.sub,
                            loginProvider: payload.loginProvider,
                            refreshToken: payload.refreshToken,
                        });
                        res.cookie('SESSIONID', sessionToken, {
                            httpOnly: true,
                            secure: this.useSecure,
                        });
                        req['user'] = await this.securityService.decodeJwt(sessionToken);
                        return next();
                    }
                    req['user'] = payload;
                    next();
                } catch (err) {
                    console.log('Error: Could not extract user from request:', err.message);
                    next();
                }
            } else {
                next();
            }
        };
    }
}
