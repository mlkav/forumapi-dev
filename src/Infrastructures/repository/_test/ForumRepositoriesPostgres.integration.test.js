import { nanoid } from 'nanoid';
import pool from '../../database/postgres/pool.js';
import ThreadRepositoryPostgres from '../ThreadRepositoryPostgres.js';
import CommentRepositoryPostgres from '../CommentRepositoryPostgres.js';
import ReplyRepositoryPostgres from '../ReplyRepositoryPostgres.js';

describe('forum PostgreSQL repositories integration', () => {
  const ownerId = `user-${nanoid()}`;
  const otherOwnerId = `user-${nanoid()}`;
  const ownerUsername = `integration-${nanoid()}`;
  const otherUsername = `integration-${nanoid()}`;

  const threadRepository = new ThreadRepositoryPostgres(pool, nanoid);
  const commentRepository = new CommentRepositoryPostgres(pool, nanoid);
  const replyRepository = new ReplyRepositoryPostgres(pool, nanoid);

  beforeAll(async () => {
    await pool.query(
      'INSERT INTO users (id, username, password, fullname) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
      [ownerId, ownerUsername, 'hash', 'Owner', otherOwnerId, otherUsername, 'hash', 'Other'],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::varchar[])', [[ownerId, otherOwnerId]]);
    await pool.end();
  });

  it('should persist, relate, order, authorize, and soft-delete forum resources', async () => {
    const thread = await threadRepository.addThread(
      { title: 'Integration thread', body: 'Integration body' },
      ownerId,
    );
    const otherThread = await threadRepository.addThread(
      { title: 'Other thread', body: 'Other body' },
      ownerId,
    );

    await expect(threadRepository.checkAvailabilityThread(thread.id)).resolves.toBeUndefined();
    await expect(threadRepository.checkAvailabilityThread('missing-thread'))
      .rejects.toThrow('thread tidak ditemukan');
    await expect(threadRepository.getThreadById(thread.id)).resolves.toMatchObject({
      id: thread.id,
      title: 'Integration thread',
      body: 'Integration body',
      username: ownerUsername,
    });

    const comment = await commentRepository.addComment(
      { content: 'first comment' },
      thread.id,
      ownerId,
    );
    const laterComment = await commentRepository.addComment(
      { content: 'second comment' },
      thread.id,
      otherOwnerId,
    );
    const unrelatedComment = await commentRepository.addComment(
      { content: 'unrelated comment' },
      otherThread.id,
      ownerId,
    );

    await expect(commentRepository.checkAvailabilityComment(comment.id, thread.id))
      .resolves.toBeUndefined();
    await expect(commentRepository.checkAvailabilityComment(comment.id, otherThread.id))
      .rejects.toThrow('komentar tidak ditemukan');
    await expect(commentRepository.checkAvailabilityComment('missing-comment', thread.id))
      .rejects.toThrow('komentar tidak ditemukan');
    await expect(commentRepository.verifyCommentOwner(comment.id, ownerId))
      .resolves.toBeUndefined();
    await expect(commentRepository.verifyCommentOwner(comment.id, otherOwnerId))
      .rejects.toThrow('anda tidak berhak');

    await pool.query('UPDATE comments SET date = $1 WHERE id = $2', [
      '2020-01-02T00:00:00.000Z',
      comment.id,
    ]);
    await pool.query('UPDATE comments SET date = $1 WHERE id = $2', [
      '2020-01-03T00:00:00.000Z',
      laterComment.id,
    ]);
    await commentRepository.deleteComment(comment.id);

    const storedDeletedComment = await pool.query(
      'SELECT id, is_delete FROM comments WHERE id = $1',
      [comment.id],
    );
    expect(storedDeletedComment.rows).toEqual([{ id: comment.id, is_delete: true }]);
    await expect(commentRepository.checkAvailabilityComment(comment.id, thread.id))
      .rejects.toThrow('komentar tidak ditemukan');

    const orderedComments = await commentRepository.getCommentsByThreadId(thread.id);
    expect(orderedComments.map(({ id }) => id)).toEqual([comment.id, laterComment.id]);
    expect(orderedComments[0].is_delete).toBe(true);
    expect(await commentRepository.getCommentsByThreadId(otherThread.id))
      .toMatchObject([{ id: unrelatedComment.id, content: 'unrelated comment' }]);

    const firstReply = await replyRepository.addReply(
      { content: 'first reply' },
      laterComment.id,
      ownerId,
    );
    const secondReply = await replyRepository.addReply(
      { content: 'second reply' },
      laterComment.id,
      otherOwnerId,
    );
    await expect(replyRepository.checkAvailabilityReply(firstReply.id, laterComment.id))
      .resolves.toBeUndefined();
    await expect(replyRepository.checkAvailabilityReply(firstReply.id, comment.id))
      .rejects.toThrow('balasan tidak ditemukan');
    await expect(replyRepository.checkAvailabilityReply('missing-reply', laterComment.id))
      .rejects.toThrow('balasan tidak ditemukan');
    await expect(replyRepository.verifyReplyOwner(firstReply.id, ownerId))
      .resolves.toBeUndefined();
    await expect(replyRepository.verifyReplyOwner(firstReply.id, otherOwnerId))
      .rejects.toThrow('anda tidak berhak');

    await pool.query('UPDATE replies SET date = $1 WHERE id = $2', [
      '2020-01-04T00:00:00.000Z',
      firstReply.id,
    ]);
    await pool.query('UPDATE replies SET date = $1 WHERE id = $2', [
      '2020-01-05T00:00:00.000Z',
      secondReply.id,
    ]);
    await replyRepository.deleteReply(firstReply.id);

    const storedDeletedReply = await pool.query(
      'SELECT id, is_delete FROM replies WHERE id = $1',
      [firstReply.id],
    );
    expect(storedDeletedReply.rows).toEqual([{ id: firstReply.id, is_delete: true }]);
    await expect(replyRepository.checkAvailabilityReply(firstReply.id, laterComment.id))
      .rejects.toThrow('balasan tidak ditemukan');

    const orderedReplies = await replyRepository.getRepliesByCommentId(laterComment.id);
    expect(orderedReplies.map(({ id }) => id)).toEqual([firstReply.id, secondReply.id]);
    expect(orderedReplies[0].is_delete).toBe(true);
    expect(await replyRepository.getRepliesByThreadId(thread.id))
      .toMatchObject([{ id: firstReply.id }, { id: secondReply.id }]);
    expect(await replyRepository.getRepliesByThreadId(otherThread.id)).toEqual([]);
  });
});
