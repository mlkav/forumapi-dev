import { vi } from 'vitest';
import AuthorizationError from '../../../Commons/exceptions/AuthorizationError.js';
import NotFoundError from '../../../Commons/exceptions/NotFoundError.js';
import CommentRepositoryPostgres from '../CommentRepositoryPostgres.js';

describe('CommentRepositoryPostgres', () => {
  it('should add a comment and return its public properties', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'comment-123', content: 'comment', owner: 'user-123' }],
      }),
    };
    const repository = new CommentRepositoryPostgres(pool, () => '123');

    const result = await repository.addComment(
      { content: 'comment' },
      'thread-123',
      'user-123',
    );

    expect(result).toEqual({ id: 'comment-123', content: 'comment', owner: 'user-123' });
    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      values: ['comment-123', 'thread-123', 'user-123', 'comment'],
    }));
  });

  it('should check comment availability', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new CommentRepositoryPostgres(pool, () => '123');

    await expect(repository.checkAvailabilityComment('comment-123', 'thread-123'))
      .resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      values: ['comment-123', 'thread-123'],
      text: expect.stringContaining('is_delete = FALSE'),
    }));
  });

  it('should reject when a comment is unavailable', async () => {
    const repository = new CommentRepositoryPostgres({
      query: vi.fn().mockResolvedValue({ rowCount: 0 }),
    }, () => '123');

    await expect(repository.checkAvailabilityComment('missing-comment', 'thread-123'))
      .rejects.toThrow(NotFoundError);
  });

  it('should allow the comment owner and reject other users', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ owner: 'user-123' }] }) };
    const repository = new CommentRepositoryPostgres(pool, () => '123');

    await expect(repository.verifyCommentOwner('comment-123', 'user-123')).resolves.toBeUndefined();
    await expect(repository.verifyCommentOwner('comment-123', 'other-user')).rejects.toThrow(AuthorizationError);
  });

  it('should reject ownership checks for comments that do not exist', async () => {
    const repository = new CommentRepositoryPostgres({
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    }, () => '123');

    await expect(repository.verifyCommentOwner('missing-comment', 'user-123')).rejects.toThrow(AuthorizationError);
  });

  it('should soft-delete a comment', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new CommentRepositoryPostgres(pool, () => '123');

    await repository.deleteComment('comment-123');

    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('UPDATE comments SET is_delete = TRUE'),
      values: ['comment-123'],
    }));
  });

  it('should return comments for a thread', async () => {
    const comments = [{ id: 'comment-123', content: 'comment', like_count: 2 }];
    const pool = { query: vi.fn().mockResolvedValue({ rows: comments }) };
    const repository = new CommentRepositoryPostgres(pool, () => '123');

    await expect(repository.getCommentsByThreadId('thread-123')).resolves.toEqual(comments);
    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('AS like_count'),
    }));
  });

  it('should treat deleted comments as unavailable', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };
    const repository = new CommentRepositoryPostgres(pool, () => '123');

    await expect(repository.checkAvailabilityComment('comment-123', 'thread-123'))
      .rejects.toThrow(NotFoundError);
  });
});
