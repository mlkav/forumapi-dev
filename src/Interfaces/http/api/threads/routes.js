import express from 'express';
import authenticate from './authenticate.js';

const createThreadsRouter = (handler, container) => {
  const router = express.Router();
  const requireAuthentication = authenticate(container);

  router.post('/', requireAuthentication, handler.postThreadHandler);
  router.get('/:threadId', handler.getThreadHandler);
  router.post('/:threadId/comments', requireAuthentication, handler.postCommentHandler);
  router.delete('/:threadId/comments/:commentId', requireAuthentication, handler.deleteCommentHandler);
  router.post(
    '/:threadId/comments/:commentId/replies',
    requireAuthentication,
    handler.postReplyHandler,
  );
  router.delete(
    '/:threadId/comments/:commentId/replies/:replyId',
    requireAuthentication,
    handler.deleteReplyHandler,
  );

  return router;
};

export default createThreadsRouter;
