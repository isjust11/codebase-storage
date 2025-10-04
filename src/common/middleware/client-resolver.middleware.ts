import { Injectable, NestMiddleware, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { ClientKeyService } from '../../keys/client-key.service';

declare module 'express-serve-static-core' {
  interface Request {
    clientKey?: string;
  }
}

@Injectable()
export class ClientResolverMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService, private readonly clientKeyService: ClientKeyService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const headerKey = this.configService.get<string>('CLIENT_HEADER_KEY') || 'x-client-key';
    const clientKey = (req.headers[headerKey] as string) || (req.query.client as string);
    const requestUrl = req.baseUrl;
    if(requestUrl.includes('admin/client-keys') || requestUrl.includes(`${process.env.STORAGE_ROOT}/(.*)`)) {
      next();
      return;
    }
    if (!clientKey) {
      throw new BadRequestException(`Missing client identifier. Provide header '${headerKey}' or query 'client'.`);
    }
    this.clientKeyService.validateKey(clientKey.toString())
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
}


