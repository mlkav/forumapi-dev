import AuthenticationError from '../../../../Commons/exceptions/AuthenticationError.js';
import InvariantError from '../../../../Commons/exceptions/InvariantError.js';
import AuthenticationTokenManager from '../../../../Applications/security/AuthenticationTokenManager.js';

const authenticate = (container) => async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return next(new AuthenticationError('Missing authentication'));
  }

  const credentials = authorization.trim().split(/\s+/);
  const [scheme, token] = credentials;
  if (credentials.length !== 2 || scheme !== 'Bearer' || !token) {
    return next(new AuthenticationError('Invalid authentication credentials'));
  }

  const tokenManager = container.getInstance(AuthenticationTokenManager.name);
  try {
    await tokenManager.verifyAccessToken(token);
  } catch (error) {
    if (error instanceof InvariantError) {
      return next(new AuthenticationError('Invalid authentication credentials'));
    }
    return next(error);
  }

  const payload = await tokenManager.decodePayload(token);
  if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string') {
    return next(new AuthenticationError('Invalid authentication credentials'));
  }
  req.auth = { id: payload.id };
  return next();
};

export default authenticate;
