CREATE TABLE client_keys (
  client_id text NOT NULL,
  key_version integer NOT NULL,
  wrapped_key bytea NOT NULL,
  wrap_nonce bytea NOT NULL,
  master_key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, key_version)
);

CREATE TABLE credentials (
  id uuid PRIMARY KEY,
  client_id text NOT NULL,
  key_version integer NOT NULL,
  provider text NOT NULL CHECK (provider IN ('shopify', 'meta_ads', 'google_ads')),
  label text,
  ciphertext bytea,
  nonce bytea,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (client_id, key_version) REFERENCES client_keys (client_id, key_version),
  CHECK ((status = 'active') = (ciphertext IS NOT NULL AND nonce IS NOT NULL))
);

CREATE TABLE service_tokens (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE token_permissions (
  token_id uuid NOT NULL REFERENCES service_tokens (id) ON DELETE CASCADE,
  permission text NOT NULL,
  PRIMARY KEY (token_id, permission)
);

CREATE TABLE token_purposes (
  token_id uuid NOT NULL REFERENCES service_tokens (id) ON DELETE CASCADE,
  purpose text NOT NULL,
  PRIMARY KEY (token_id, purpose)
);

CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT clock_timestamp(),
  action text NOT NULL CHECK (action IN ('store', 'use', 'revoke', 'audit_read')),
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied', 'error')),
  http_status integer NOT NULL,
  token_id uuid,
  client_id text,
  credential_id uuid,
  provider text,
  purpose text,
  reason text
);

CREATE INDEX audit_events_client_idx ON audit_events (client_id, id DESC);
