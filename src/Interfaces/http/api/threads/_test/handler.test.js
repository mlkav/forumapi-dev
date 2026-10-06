import { vi } from 'vitest';
import AddThreadUseCase from '../../../../../Applications/use_case/AddThreadUseCase.js';
import GetThreadDetailUseCase from '../../../../../Applications/use_case/GetThreadDetailUseCase.js';
import AddCommentUseCase from '../../../../../Applications/use_case/AddCommentUseCase.js';
import DeleteCommentUseCase from '../../../../../Applications/use_case/DeleteCommentUseCase.js';
import AddReplyUseCase from '../../../../../Applications/use_case/AddReplyUseCase.js';
import DeleteReplyUseCase from '../../../../../Applications/use_case/DeleteReplyUseCase.js';
import ToggleCommentLikeUseCase from '../../../../../Applications/use_case/ToggleCommentLikeUseCase.js';
import ThreadsHandler from '../handler.js';

describe('ThreadsHandler', () => {
  const handlerCases = [
    {
      method: 'postThreadHandler',
      useCase: AddThreadUseCase,
      request: { body: { title: 'title', body: 'body' }, auth: { id: 'user-123' } },
      result: { id: 'thread-123' },
      statusCode: 201,
      body: (result) => ({ status: 'success', data: { addedThread: result } }),
    },
    {
      method: 'getThreadHandler',
      useCase: GetThreadDetailUseCase,
      request: { params: { threadId: 'thread-123' } },
      result: { id: 'thread-123' },
      body: (result) => ({ status: 'success', data: { thread: result } }),
    },
    {
      method: 'postCommentHandler',
      useCase: AddCommentUseCase,
      request: {
        body: { content: 'comment' },
        params: { threadId: 'thread-123' },
        auth: { id: 'user-123' },
      },
      result: { id: 'comment-123' },
      statusCode: 201,
      body: (result) => ({ status: 'success', data: { addedComment: result } }),
    },
    {
      method: 'deleteCommentHandler',
      useCase: DeleteCommentUseCase,
      request: {
        params: { threadId: 'thread-123', commentId: 'comment-123' },
        auth: { id: 'user-123' },
      },
      body: () => ({ status: 'success' }),
    },
    {
      method: 'postReplyHandler',
      useCase: AddReplyUseCase,
      request: {
        body: { content: 'reply' },
        params: { threadId: 'thread-123', commentId: 'comment-123' },
        auth: { id: 'user-123' },
      },
      result: { id: 'reply-123' },
      statusCode: 201,
      body: (result) => ({ status: 'success', data: { addedReply: result } }),
    },
    {
      method: 'deleteReplyHandler',
      useCase: DeleteReplyUseCase,
      request: {
        params: { threadId: 'thread-123', commentId: 'comment-123', replyId: 'reply-123' },
        auth: { id: 'user-123' },
      },
      body: () => ({ status: 'success' }),
    },
    {
      method: 'toggleCommentLikeHandler',
      useCase: ToggleCommentLikeUseCase,
      request: {
        params: { threadId: 'thread-123', commentId: 'comment-123' },
        auth: { id: 'user-123' },
      },
      body: () => ({ status: 'success' }),
    },
  ];

  it.each(handlerCases)('should handle $method successfully', async ({
    method,
    useCase,
    request,
    result,
    statusCode,
    body,
  }) => {
    const execute = vi.fn().mockResolvedValue(result);
    const container = { getInstance: vi.fn().mockReturnValue({ execute }) };
    const handler = new ThreadsHandler(container);
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();

    await handler[method](request, response, next);

    expect(container.getInstance).toHaveBeenCalledWith(useCase.name);
    if (statusCode) {
      expect(response.status).toHaveBeenCalledWith(statusCode);
    } else {
      expect(response.status).not.toHaveBeenCalled();
    }
    expect(response.json).toHaveBeenCalledWith(body(result));
    expect(next).not.toHaveBeenCalled();
  });

  it.each(handlerCases)('should forward errors from $method', async ({ method, useCase }) => {
    const error = new Error('use case failed');
    const container = { getInstance: vi.fn().mockReturnValue({ execute: vi.fn().mockRejectedValue(error) }) };
    const handler = new ThreadsHandler(container);
    const next = vi.fn();

    await handler[method]({ body: {}, params: {}, auth: { id: 'user-123' } }, {}, next);

    expect(container.getInstance).toHaveBeenCalledWith(useCase.name);
    expect(next).toHaveBeenCalledWith(error);
  });
});
