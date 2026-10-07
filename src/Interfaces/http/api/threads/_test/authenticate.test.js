import { vi } from 'vitest';
import AuthenticationError from '../../../../../Commons/exceptions/AuthenticationError.js';
import InvariantError from '../../../../../Commons/exceptions/InvariantError.js';
import AuthenticationTokenManager from '../../../../../Applications/security/AuthenticationTokenManager.js';
import authenticate from '../authenticate.js';

describe('thread authentication middleware', () => {
  const runMiddleware = async (authorization, tokenManager = {}) => {
    const req = { headers: {} };
    if (authorization !== undefined) req.headers.authorization = authorization;
    const next = vi.fn();
    const container = {
      getInstance: vi.fn().mockReturnValue(tokenManager),
    };

    await authenticate(container)(req, {}, next);
    return { req, next, container };
  };

  it('should require an authorization header', async () => {
    const { next, container } = await runMiddleware(undefined);

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    expect(next.mock.calls[0][0].message).toBe('Missing authentication');
    expect(container.getInstance).not.toHaveBeenCalled();
  });

  it.each(['Basic token', 'Bearer', 'Bearer token extra'])(
    'should reject malformed credentials: %s',
    async (header) => {
      const { next, container } = await runMiddleware(header);

      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
      expect(next.mock.calls[0][0].message).toBe(
        'Invalid authentication credentials',
      );
      expect(container.getInstance).not.toHaveBeenCalled();
    },
  );

  it('should translate invalid access tokens into authentication errors', async () => {
    const { next } = await runMiddleware('Bearer token', {
      verifyAccessToken: vi
        .fn()
        .mockRejectedValue(new InvariantError('invalid token')),
    });

    expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('should forward unexpected token verification errors', async () => {
    const error = new Error('token service unavailable');
    const { next } = await runMiddleware('Bearer token', {
      verifyAccessToken: vi.fn().mockRejectedValue(error),
    });

    expect(next).toHaveBeenCalledWith(error);
  });

  it.each([undefined, null, 'invalid payload', {}, { id: 123 }])(
    'should reject tokens without a string user id: %s',
    async (payload) => {
      const tokenManager = {
        verifyAccessToken: vi.fn().mockResolvedValue(undefined),
        decodePayload: vi.fn().mockResolvedValue(payload),
      };
      const { next } = await runMiddleware('Bearer token', tokenManager);

      expect(tokenManager.verifyAccessToken).toHaveBeenCalledWith('token');
      expect(next).toHaveBeenCalledWith(expect.any(AuthenticationError));
    },
  );

  it('should attach the token user and continue', async () => {
    const tokenManager = {
      verifyAccessToken: vi.fn().mockResolvedValue(undefined),
      decodePayload: vi.fn().mockResolvedValue({ id: 'user-123' }),
    };
    const { req, next, container } = await runMiddleware(
      'Bearer token',
      tokenManager,
    );

    expect(container.getInstance).toHaveBeenCalledWith(
      AuthenticationTokenManager.name,
    );
    expect(req.auth).toEqual({ id: 'user-123' });
    expect(next).toHaveBeenCalledWith();
  });
});
