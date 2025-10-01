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