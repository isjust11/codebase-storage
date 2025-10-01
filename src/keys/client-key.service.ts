import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface ClientKeyRecord {
  id: number;
  key: string;
  name: string;
  isActive: boolean;
  revokedAt?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientKeyDto {
  name: string;
  note?: string;
}

export interface UpdateClientKeyDto {
  name?: string;
  isActive?: boolean;
  note?: string;
}

@Injectable()
export class ClientKeyService {
  private readonly storeFile: string;

  constructor(private readonly configService: ConfigService) {
    const storageRoot = this.configService.get<string>('STORAGE_ROOT') || 'storage';
    this.storeFile = path.resolve(process.cwd(), storageRoot, '..', 'client-keys.json');
  }

  private async ensureDir() {
    await fs.mkdir(path.dirname(this.storeFile), { recursive: true });
  }

  private async readAll(): Promise<ClientKeyRecord[]> {
    try {
      const raw = await fs.readFile(this.storeFile, 'utf8');
      const list = JSON.parse(raw) as ClientKeyRecord[];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  private async writeAll(list: ClientKeyRecord[]): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.storeFile, JSON.stringify(list, null, 2), 'utf8');
  }

  private generateKey(): string {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async create(dto: CreateClientKeyDto): Promise<ClientKeyRecord> {
    const list = await this.readAll();
    const now = new Date().toISOString();
    const id = list.length ? Math.max(...list.map(x => x.id)) + 1 : 1;
    const record: ClientKeyRecord = {
      id,
      key: this.generateKey(),
      name: dto.name,
      isActive: true,
      revokedAt: null,
      note: dto.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    list.unshift(record);
    await this.writeAll(list);
    return record;
  }

  async findAll(): Promise<ClientKeyRecord[]> {
    return this.readAll();
  }

  async findOne(id: number): Promise<ClientKeyRecord | undefined> {
    const list = await this.readAll();
    return list.find(x => x.id === id);
  }

  async update(id: number, dto: UpdateClientKeyDto): Promise<ClientKeyRecord | undefined> {
    const list = await this.readAll();
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return undefined;
    const now = new Date().toISOString();
    list[idx] = { ...list[idx], ...dto, updatedAt: now };
    await this.writeAll(list);
    return list[idx];
  }

  async revoke(id: number): Promise<ClientKeyRecord | undefined> {
    return this.update(id, { isActive: false, note: undefined });
  }

  async rotate(id: number): Promise<ClientKeyRecord | undefined> {
    const list = await this.readAll();
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return undefined;
    const now = new Date().toISOString();
    list[idx] = { ...list[idx], key: this.generateKey(), isActive: true, revokedAt: null, updatedAt: now };
    await this.writeAll(list);
    return list[idx];
  }

  async remove(id: number): Promise<boolean> {
    const list = await this.readAll();
    const next = list.filter(x => x.id !== id);
    const changed = next.length !== list.length;
    if (changed) await this.writeAll(next);
    return changed;
  }

  async validateKey(key: string): Promise<boolean> {
    const list = await this.readAll();
    return list.some(x => x.key === key && x.isActive);
  }
}


