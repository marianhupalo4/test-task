export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

export interface Secret {
  key: string;
  value: string;
  version: number;
  updatedAt: string;
}

export type TokenScope = 'read' | 'write' | 'admin';

export interface ServiceToken {
  id: string;
  projectId: string;
  environmentId: string;
  scope: TokenScope;
  expiresAt: string | null;
  createdAt: string;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}
