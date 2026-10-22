export class CredentialServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errors = {
  validation: (message: string) => new CredentialServiceError(400, 'validation_error', message),
  unauthorized: () =>
    new CredentialServiceError(401, 'unauthorized', 'Missing, invalid or revoked token'),
  forbidden: (message = 'Token lacks the required permission') =>
    new CredentialServiceError(403, 'forbidden', message),
  purposeNotAllowed: () =>
    new CredentialServiceError(
      403,
      'purpose_not_allowed',
      'Purpose is not allowed for this service',
    ),
  notFound: () => new CredentialServiceError(404, 'not_found', 'Credential not found'),
  revoked: () => new CredentialServiceError(410, 'revoked', 'Credential is revoked'),
  decryptionFailed: () =>
    new CredentialServiceError(500, 'decryption_failed', 'Credential cannot be decrypted'),
  auditUnavailable: () =>
    new CredentialServiceError(503, 'audit_unavailable', 'Audit event could not be written'),
};
