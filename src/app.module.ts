import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientResolverMiddleware } from './common/middleware/client-resolver.middleware';
import { StorageModule } from './storage/storage.module';
import { ClientKeyModule } from './keys/client-key.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validate: (config: Record<string, unknown>) => {
        const schema = z.object({
          NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
          // PORT: z.coerce.number().int().positive().default(3005),
          STORAGE_ROOT: z.string().min(1).default('storage'),
          CLIENT_HEADER_KEY: z.string().min(1).default('x-client-key'),
        });
        const result = schema.safeParse(config);
        if (!result.success) {
          throw new Error(`Invalid environment variables: ${result.error.message}`);
        }
        return {
          ...config,
          NODE_ENV: result.data.NODE_ENV,
          // PORT: result.data.PORT.toString(),
          STORAGE_ROOT: result.data.STORAGE_ROOT,
          CLIENT_HEADER_KEY: result.data.CLIENT_HEADER_KEY,
        } as Record<string, string>;
      },
    }),
    StorageModule,
    ClientKeyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ClientResolverMiddleware)
    .exclude('admin/client-keys/(.*)')
    .exclude(`${process.env.STORAGE_ROOT}/(.*)`)
    .forRoutes('*');
  }
}
