import NotFoundError from '../../Commons/exceptions/NotFoundError.js';
import CommentLikeRepository from '../../Domains/comments/CommentLikeRepository.js';

class CommentLikeRepositoryPostgres extends CommentLikeRepository {
  constructor(pool) {
    super();
    this._pool = pool;
  }

  async withCommentLock(commentId, threadId, callback) {
    const client = await this._pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query({
        text: `SELECT id FROM comments
          WHERE id = $1 AND thread_id = $2 AND is_delete = FALSE
          FOR UPDATE`,
        values: [commentId, threadId],
      });
      if (!result.rowCount) {
        throw new NotFoundError('komentar tidak ditemukan');
      }

      const transactionRepository = {
        getLike: (userId, selectedCommentId) =>
          this._getLike(client, userId, selectedCommentId),
        addLike: (userId, selectedCommentId) =>
          this._addLike(client, userId, selectedCommentId),
        removeLike: (userId, selectedCommentId) =>
          this._removeLike(client, userId, selectedCommentId),
      };
      const resultFromCallback = await callback(transactionRepository);
      await client.query('COMMIT');
      return resultFromCallback;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLike(userId, commentId) {
    return this._getLike(this._pool, userId, commentId);
  }

  async _getLike(database, userId, commentId) {
    const result = await database.query({
      text: 'SELECT user_id, comment_id FROM comment_likes WHERE user_id = $1 AND comment_id = $2',
      values: [userId, commentId],
    });
    return result.rows[0] ?? null;
  }

  async addLike(userId, commentId) {
    return this._addLike(this._pool, userId, commentId);
  }

  async _addLike(database, userId, commentId) {
    await database.query({
      text: `INSERT INTO comment_likes (user_id, comment_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, comment_id) DO NOTHING`,
      values: [userId, commentId],
    });
  }

  async removeLike(userId, commentId) {
    return this._removeLike(this._pool, userId, commentId);
  }

  async _removeLike(database, userId, commentId) {
    await database.query({
      text: 'DELETE FROM comment_likes WHERE user_id = $1 AND comment_id = $2',
      values: [userId, commentId],
    });
  }

  async countLikes(commentId) {
    const result = await this._pool.query({
      text: 'SELECT COUNT(*)::integer AS count FROM comment_likes WHERE comment_id = $1',
      values: [commentId],
    });
    return result.rows[0].count;
  }
}

export default CommentLikeRepositoryPostgres;
