import { vi } from 'vitest';
import NotFoundError from '../../../Commons/exceptions/NotFoundError.js';
import CommentLikeRepositoryPostgres from '../CommentLikeRepositoryPostgres.js';

describe('CommentLikeRepositoryPostgres', () => {
  const createClient = (query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] })) => ({
    query,
    release: vi.fn(),
  });

  it('should execute a toggle callback atomically while locking an active parent comment', async () => {
    const client = createClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const repository = new CommentLikeRepositoryPostgres(pool);
    const callback = vi.fn().mockResolvedValue('completed');

    await expect(repository.withCommentLock('comment-123', 'thread-123', callback))
      .resolves.toBe('completed');

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: expect.stringContaining('FOR UPDATE'),
      values: ['comment-123', 'thread-123'],
    }));
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      getLike: expect.any(Function),
      addLike: expect.any(Function),
      removeLike: expect.any(Function),
    }));
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('should rollback and release the client when the comment is missing', async () => {
    const client = createClient(vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce(undefined));
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const repository = new CommentLikeRepositoryPostgres(pool);

    await expect(repository.withCommentLock('comment-123', 'thread-123', vi.fn()))
      .rejects.toThrow(NotFoundError);

    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('should rollback and rethrow callback errors', async () => {
    const client = createClient();
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const repository = new CommentLikeRepositoryPostgres(pool);
    const error = new Error('toggle failed');

    await expect(repository.withCommentLock('comment-123', 'thread-123', () => {
      throw error;
    })).rejects.toBe(error);

    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('should read an existing like and return null when it is absent', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-123', comment_id: 'comment-123' }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const repository = new CommentLikeRepositoryPostgres(pool);

    await expect(repository.getLike('user-123', 'comment-123'))
      .resolves.toEqual({ user_id: 'user-123', comment_id: 'comment-123' });
    await expect(repository.getLike('user-123', 'comment-123')).resolves.toBeNull();
  });

  it('should add idempotently, remove, and count likes', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ count: 2 }] }),
    };
    const repository = new CommentLikeRepositoryPostgres(pool);

    await expect(repository.addLike('user-123', 'comment-123')).resolves.toBeUndefined();
    await expect(repository.removeLike('user-123', 'comment-123')).resolves.toBeUndefined();
    await expect(repository.countLikes('comment-123')).resolves.toBe(2);
    expect(pool.query).toHaveBeenNthCalledWith(1, expect.objectContaining({
      text: expect.stringContaining('ON CONFLICT (user_id, comment_id) DO NOTHING'),
    }));
    expect(pool.query).toHaveBeenNthCalledWith(2, expect.objectContaining({
      text: expect.stringContaining('DELETE FROM comment_likes'),
    }));
    expect(pool.query).toHaveBeenNthCalledWith(3, expect.objectContaining({
      text: expect.stringContaining('COUNT(*)::integer'),
    }));
  });
});
