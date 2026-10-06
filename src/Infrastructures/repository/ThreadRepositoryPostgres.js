import NotFoundError from '../../Commons/exceptions/NotFoundError.js';
import ThreadRepository from '../../Domains/threads/ThreadRepository.js';
import AddedThread from '../../Domains/threads/entities/AddedThread.js';

class ThreadRepositoryPostgres extends ThreadRepository {
  constructor(pool, idGenerator) {
    super();
    this._pool = pool;
    this._idGenerator = idGenerator;
  }

  async addThread(newThread, owner) {
    const id = `thread-${this._idGenerator()}`;
    const query = {
      text: `INSERT INTO threads (id, title, body, owner)
        VALUES ($1, $2, $3, $4) RETURNING id, title, owner`,
      values: [id, newThread.title, newThread.body, owner],
    };
    const result = await this._pool.query(query);
    return new AddedThread(result.rows[0]);
  }

  async checkAvailabilityThread(threadId) {
    const result = await this._pool.query({
      text: 'SELECT id FROM threads WHERE id = $1',
      values: [threadId],
    });
    if (!result.rowCount) {
      throw new NotFoundError('thread tidak ditemukan');
    }
  }

  async getThreadById(threadId) {
    const result = await this._pool.query({
      text: `SELECT threads.id, threads.title, threads.body, threads.date, users.username
        FROM threads
        JOIN users ON users.id = threads.owner
        WHERE threads.id = $1`,
      values: [threadId],
    });
    if (!result.rowCount) {
      throw new NotFoundError('thread tidak ditemukan');
    }
    return result.rows[0];
  }
}

export default ThreadRepositoryPostgres;
