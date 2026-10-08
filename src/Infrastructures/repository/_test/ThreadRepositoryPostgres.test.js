import { vi } from 'vitest';
import NotFoundError from '../../../Commons/exceptions/NotFoundError.js';
import ThreadRepositoryPostgres from '../ThreadRepositoryPostgres.js';

describe('ThreadRepositoryPostgres', () => {
  it('should add a thread and return its public properties', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'thread-123', title: 'title', owner: 'user-123' }],
      }),
    };
    const repository = new ThreadRepositoryPostgres(pool, () => '123');

    const result = await repository.addThread({ title: 'title', body: 'body' }, 'user-123');

    expect(result).toEqual({ id: 'thread-123', title: 'title', owner: 'user-123' });
    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      values: ['thread-123', 'title', 'body', 'user-123'],
    }));
  });

  it('should check thread availability', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new ThreadRepositoryPostgres(pool, () => '123');

    await expect(repository.checkAvailabilityThread('thread-123')).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledWith(expect.objectContaining({
      values: ['thread-123'],
    }));
  });

  it('should reject when a thread is unavailable', async () => {
    const repository = new ThreadRepositoryPostgres({
      query: vi.fn().mockResolvedValue({ rowCount: 0 }),
    }, () => '123');

    await expect(repository.checkAvailabilityThread('missing-thread')).rejects.toThrow(NotFoundError);
  });

  it('should return thread details', async () => {
    const thread = {
      id: 'thread-123',
      title: 'title',
      body: 'body',
      date: '2026-10-03T00:00:00.000Z',
      username: 'dicoding',
    };
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 1, rows: [thread] }) };
    const repository = new ThreadRepositoryPostgres(pool, () => '123');

    await expect(repository.getThreadById('thread-123')).resolves.toEqual(thread);
  });

  it('should reject when thread details do not exist', async () => {
    const repository = new ThreadRepositoryPostgres({
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    }, () => '123');

    await expect(repository.getThreadById('missing-thread')).rejects.toThrow(NotFoundError);
  });
});
