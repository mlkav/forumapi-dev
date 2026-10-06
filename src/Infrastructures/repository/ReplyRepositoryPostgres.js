import AuthorizationError from '../../Commons/exceptions/AuthorizationError.js';
import NotFoundError from '../../Commons/exceptions/NotFoundError.js';
import ReplyRepository from '../../Domains/replies/ReplyRepository.js';
import AddedReply from '../../Domains/replies/entities/AddedReply.js';

class ReplyRepositoryPostgres extends ReplyRepository {
  constructor(pool, idGenerator) {
    super();
    this._pool = pool;
    this._idGenerator = idGenerator;
  }

  async addReply(newReply, commentId, owner) {
    const id = `reply-${this._idGenerator()}`;
    const result = await this._pool.query({
      text: `INSERT INTO replies (id, comment_id, owner, content)
        VALUES ($1, $2, $3, $4) RETURNING id, content, owner`,
      values: [id, commentId, owner, newReply.content],
    });
    return new AddedReply(result.rows[0]);
  }

  async checkAvailabilityReply(replyId, commentId) {
    const result = await this._pool.query({
      text: `SELECT id FROM replies
        WHERE id = $1 AND comment_id = $2 AND is_delete = FALSE`,
      values: [replyId, commentId],
    });
    if (!result.rowCount) {
      throw new NotFoundError('balasan tidak ditemukan');
    }
  }

  async verifyReplyOwner(replyId, owner) {
    const result = await this._pool.query({
      text: 'SELECT owner FROM replies WHERE id = $1 AND is_delete = FALSE',
      values: [replyId],
    });
    if (!result.rowCount || result.rows[0].owner !== owner) {
      throw new AuthorizationError('anda tidak berhak mengakses resource ini');
    }
  }

  async deleteReply(replyId) {
    await this._pool.query({
      text: 'UPDATE replies SET is_delete = TRUE WHERE id = $1',
      values: [replyId],
    });
  }

  async getRepliesByCommentId(commentId) {
    const result = await this._pool.query({
      text: `SELECT replies.id, replies.comment_id, users.username, replies.date,
          replies.content, replies.is_delete
        FROM replies
        JOIN users ON users.id = replies.owner
        WHERE replies.comment_id = $1
        ORDER BY replies.date ASC, replies.id ASC`,
      values: [commentId],
    });
    return result.rows;
  }

  async getRepliesByThreadId(threadId) {
    const result = await this._pool.query({
      text: `SELECT replies.id, replies.comment_id, users.username, replies.date,
          replies.content, replies.is_delete
        FROM replies
        JOIN comments ON comments.id = replies.comment_id
        JOIN users ON users.id = replies.owner
        WHERE comments.thread_id = $1
        ORDER BY replies.date ASC, replies.id ASC`,
      values: [threadId],
    });
    return result.rows;
  }
}

export default ReplyRepositoryPostgres;
