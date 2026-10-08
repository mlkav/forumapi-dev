import AuthorizationError from '../../Commons/exceptions/AuthorizationError.js';
import NotFoundError from '../../Commons/exceptions/NotFoundError.js';
import CommentRepository from '../../Domains/comments/CommentRepository.js';
import AddedComment from '../../Domains/comments/entities/AddedComment.js';

class CommentRepositoryPostgres extends CommentRepository {
  constructor(pool, idGenerator) {
    super();
    this._pool = pool;
    this._idGenerator = idGenerator;
  }

  async addComment(newComment, threadId, owner) {
    const id = `comment-${this._idGenerator()}`;
    const result = await this._pool.query({
      text: `INSERT INTO comments (id, thread_id, owner, content)
        VALUES ($1, $2, $3, $4) RETURNING id, content, owner`,
      values: [id, threadId, owner, newComment.content],
    });
    return new AddedComment(result.rows[0]);
  }

  async checkAvailabilityComment(commentId, threadId) {
    const result = await this._pool.query({
      text: `SELECT id FROM comments
        WHERE id = $1 AND thread_id = $2 AND is_delete = FALSE`,
      values: [commentId, threadId],
    });
    if (!result.rowCount) {
      throw new NotFoundError('komentar tidak ditemukan');
    }
  }

  async verifyCommentOwner(commentId, owner) {
    const result = await this._pool.query({
      text: 'SELECT owner FROM comments WHERE id = $1 AND is_delete = FALSE',
      values: [commentId],
    });
    if (!result.rowCount || result.rows[0].owner !== owner) {
      throw new AuthorizationError('anda tidak berhak mengakses resource ini');
    }
  }

  async deleteComment(commentId) {
    await this._pool.query({
      text: 'UPDATE comments SET is_delete = TRUE WHERE id = $1',
      values: [commentId],
    });
  }

  async getCommentsByThreadId(threadId) {
    const result = await this._pool.query({
      text: `SELECT comments.id, users.username, comments.date, comments.content, comments.is_delete
        FROM comments
        JOIN users ON users.id = comments.owner
        WHERE comments.thread_id = $1
        ORDER BY comments.date ASC, comments.id ASC`,
      values: [threadId],
    });
    return result.rows;
  }
}

export default CommentRepositoryPostgres;
