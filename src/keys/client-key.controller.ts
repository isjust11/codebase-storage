import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ClientKeyService } from './client-key.service';
import type { CreateClientKeyDto } from '../dtos/CreateClientKeyDto';
import type { UpdateClientKeyDto } from '../dtos/UpdateClientKeyDto';

@Controller('admin/client-keys')
export class ClientKeyController {
  constructor(private readonly service: ClientKeyService) {}

  @Get()
  async findAll() {
    return this.service.findAll();
  }

  @Post()
  async create(@Body() dto: CreateClientKeyDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClientKeyDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/revoke')
  async revoke(@Param('id', ParseIntPipe) id: number) {
    return this.service.revoke(id);
  }

  @Post(':id/rotate')
  async rotate(@Param('id', ParseIntPipe) id: number) {
    return this.service.rotate(id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}


