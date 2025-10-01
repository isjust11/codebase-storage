import { Injectable, NestMiddleware, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as https from 'https';
import { URL } from 'url';

declare module 'express-serve-static-core' {
  interface Request {
    clientKey?: string;
  }
}

@Injectable()
export class ClientResolverMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const headerKey = this.configService.get<string>('CLIENT_HEADER_KEY') || 'x-client-key';
    const clientKey = (req.headers[headerKey] as string) || (req.query.client as string);
    if (!clientKey) {
      throw new BadRequestException(`Missing client identifier. Provide header '${headerKey}' or query 'client'.`);
    }
    this.validateKey(clientKey.toString())
      .then(isValid => {
        if (!isValid) throw new UnauthorizedException('Invalid or revoked client key');
        req.clientKey = clientKey.toString();
        next();
      })
      .catch(err => {
        if (err instanceof UnauthorizedException) throw err;
        throw new UnauthorizedException('Client key validation failed');
      });
  }

  private async validateKey(key: string): Promise<boolean> {
    const adminUrl = this.configService.get<string>('ADMIN_API_URL');
    if (!adminUrl) return true; // fallback: allow if not configured
    return new Promise<boolean>((resolve) => {
      try {
        const url = new URL(`${adminUrl.replace(/\/$/, '')}/internal/client-keys/validate`);
        url.searchParams.set('key', key);
        const req = https.request(url, { method: 'GET', timeout: 3000 }, res => {
          if (res.statusCode && res.statusCode >= 400) return resolve(false);
          let body = '';
          res.on('data', chunk => (body += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              resolve(Boolean(parsed?.valid === true));
            } catch {
              resolve(false);
            }
          });
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      } catch {
        resolve(false);
      }
    });
  }
}


