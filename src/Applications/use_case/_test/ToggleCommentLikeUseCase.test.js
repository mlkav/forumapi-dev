import { vi } from 'vitest';
import ToggleCommentLikeUseCase from '../ToggleCommentLikeUseCase.js';

describe('ToggleCommentLikeUseCase', () => {
  const createUseCase = ({ existingLike = null } = {}) => {
    const threadRepository = {
      checkAvailabilityThread: vi.fn().mockResolvedValue(undefined),
    };
    const commentRepository = {
      checkAvailabilityComment: vi.fn().mockResolvedValue(undefined),
    };
    const transactionRepository = {
      getLike: vi.fn().mockResolvedValue(existingLike),
      addLike: vi.fn().mockResolvedValue(undefined),
      removeLike: vi.fn().mockResolvedValue(undefined),
    };
    const commentLikeRepository = {
      withCommentLock: vi.fn((_commentId, _threadId, operation) => operation(transactionRepository)),
    };
    const useCase = new ToggleCommentLikeUseCase({
      threadRepository,
      commentRepository,
      commentLikeRepository,
    });

    return {
      useCase,
      threadRepository,
      commentRepository,
      commentLikeRepository,
      transactionRepository,
    };
  };

  it('should add a like when the authenticated user has not liked the comment', async () => {
    const {
      useCase,
      threadRepository,
      commentRepository,
      commentLikeRepository,
      transactionRepository,
    } = createUseCase();

    await expect(useCase.execute('thread-123', 'comment-123', 'user-123'))
      .resolves.toBeUndefined();

    expect(threadRepository.checkAvailabilityThread).toHaveBeenCalledWith('thread-123');
    expect(commentRepository.checkAvailabilityComment)
      .toHaveBeenCalledWith('comment-123', 'thread-123');
    expect(commentLikeRepository.withCommentLock).toHaveBeenCalledWith(
      'comment-123',
      'thread-123',
      expect.any(Function),
    );
    expect(transactionRepository.getLike).toHaveBeenCalledWith('user-123', 'comment-123');
    expect(transactionRepository.addLike).toHaveBeenCalledWith('user-123', 'comment-123');
    expect(transactionRepository.removeLike).not.toHaveBeenCalled();
  });

  it('should remove an existing like', async () => {
    const { useCase, transactionRepository } = createUseCase({
      existingLike: { user_id: 'user-123', comment_id: 'comment-123' },
    });

    await useCase.execute('thread-123', 'comment-123', 'user-123');

    expect(transactionRepository.removeLike).toHaveBeenCalledWith('user-123', 'comment-123');
    expect(transactionRepository.addLike).not.toHaveBeenCalled();
  });

  it.each([
    ['thread validation', 'checkAvailabilityThread'],
    ['comment validation', 'checkAvailabilityComment'],
    ['comment lock', 'withCommentLock'],
  ])('should propagate %s failures', async (_label, dependency) => {
    const error = new Error(`${dependency} failed`);
    const dependencies = createUseCase();
    const repository = dependency === 'checkAvailabilityThread'
      ? dependencies.threadRepository
      : dependency === 'checkAvailabilityComment'
        ? dependencies.commentRepository
        : dependencies.commentLikeRepository;
    repository[dependency].mockRejectedValue(error);

    await expect(dependencies.useCase.execute('thread-123', 'comment-123', 'user-123'))
      .rejects.toBe(error);
  });

  it.each([
    ['getLike', null, 'getLike'],
    ['addLike', null, 'addLike'],
    ['getLike', { user_id: 'user-123' }, 'removeLike'],
  ])('should propagate transaction %s failures', async (_label, existingLike, method) => {
    const error = new Error(`${method} failed`);
    const dependencies = createUseCase({ existingLike });
    dependencies.transactionRepository[method].mockRejectedValue(error);

    await expect(dependencies.useCase.execute('thread-123', 'comment-123', 'user-123'))
      .rejects.toBe(error);
  });
});
