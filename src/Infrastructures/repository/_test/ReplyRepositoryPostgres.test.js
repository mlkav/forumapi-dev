import { vi } from 'vitest';
import AuthorizationError from '../../../Commons/exceptions/AuthorizationError.js';
import NotFoundError from '../../../Commons/exceptions/NotFoundError.js';
import ReplyRepositoryPostgres from '../ReplyRepositoryPostgres.js';

describe('ReplyRepositoryPostgres', () => {
  it('should add a reply and return its public properties', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'reply-123', content: 'reply', owner: 'user-123' }],
      }),
    };
    const repository = new ReplyRepositoryPostgres(pool, () => '123');

    const result = await repository.addReply({ content: 'reply' }, 'comment-123', 'user-123');

    expect(result).toEqual({ id: 'reply-123', content: 'reply', owner: 'user-123' });
    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      values: ['reply-123', 'comment-123', 'user-123', 'reply'],
    }));
  });

  it('should check reply availability', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new ReplyRepositoryPostgres(pool, () => '123');

    await expect(repository.checkAvailabilityReply('reply-123', 'comment-123'))
      .resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      values: ['reply-123', 'comment-123'],
      text: expect.stringContaining('is_delete = FALSE'),
    }));
  });

  it('should reject when a reply is unavailable', async () => {
    const repository = new ReplyRepositoryPostgres({
      query: vi.fn().mockResolvedValue({ rowCount: 0 }),
    }, () => '123');

    await expect(repository.checkAvailabilityReply('missing-reply', 'comment-123'))
      .rejects.toThrow(NotFoundError);
  });

  it('should allow the reply owner and reject other users', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [{ owner: 'user-123' }] }) };
    const repository = new ReplyRepositoryPostgres(pool, () => '123');

    await expect(repository.verifyReplyOwner('reply-123', 'user-123')).resolves.toBeUndefined();
    await expect(repository.verifyReplyOwner('reply-123', 'other-user')).rejects.toThrow(AuthorizationError);
  });

  it('should reject ownership checks for replies that do not exist', async () => {
    const repository = new ReplyRepositoryPostgres({
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    }, () => '123');

    await expect(repository.verifyReplyOwner('missing-reply', 'user-123')).rejects.toThrow(AuthorizationError);
  });

  it('should soft-delete a reply', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new ReplyRepositoryPostgres(pool, () => '123');

    await repository.deleteReply('reply-123');

    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('UPDATE replies SET is_delete = TRUE'),
      values: ['reply-123'],
    }));
  });

  it('should return replies for a comment', async () => {
    const replies = [{ id: 'reply-123', comment_id: 'comment-123' }];
    const pool = { query: vi.fn().mockResolvedValue({ rows: replies }) };
    const repository = new ReplyRepositoryPostgres(pool, () => '123');

    await expect(repository.getRepliesByCommentId('comment-123')).resolves.toEqual(replies);
  });

  it('should return replies for a thread', async () => {
    const replies = [{ id: 'reply-123', comment_id: 'comment-123' }];
    const pool = { query: vi.fn().mockResolvedValue({ rows: replies }) };
    const repository = new ReplyRepositoryPostgres(pool, () => '123');

    await expect(repository.getRepliesByThreadId('thread-123')).resolves.toEqual(replies);
  });

  it('should treat deleted replies as unavailable', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };
    const repository = new ReplyRepositoryPostgres(pool, () => '123');

    await expect(repository.checkAvailabilityReply('reply-123', 'comment-123'))
      .rejects.toThrow(NotFoundError);
  });
});
