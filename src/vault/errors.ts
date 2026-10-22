export class VaultError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errors = {
  validation: (message: string) => new VaultError(400, 'validation_error', message),
  unauthorized: () => new VaultError(401, 'unauthorized', 'Missing, invalid or revoked token'),
  forbidden: (message = 'Token lacks the required permission') =>
    new VaultError(403, 'forbidden', message),
  purposeNotAllowed: () =>
    new VaultError(403, 'purpose_not_allowed', 'Purpose is not allowed for this service'),
  notFound: () => new VaultError(404, 'not_found', 'Credential not found'),
  revoked: () => new VaultError(410, 'revoked', 'Credential is revoked'),
  decryptionFailed: () =>
    new VaultError(500, 'decryption_failed', 'Credential cannot be decrypted'),
  auditUnavailable: () =>
    new VaultError(503, 'audit_unavailable', 'Audit event could not be written'),
};
