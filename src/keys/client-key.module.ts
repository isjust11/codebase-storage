import { Module } from '@nestjs/common';
import { ClientKeyService } from './client-key.service';
import { ClientKeyController } from './client-key.controller';

@Module({
  providers: [ClientKeyService],
  controllers: [ClientKeyController],
  exports: [ClientKeyService],
})
export class ClientKeyModule {}


