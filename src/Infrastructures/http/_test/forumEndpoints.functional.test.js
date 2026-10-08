import { nanoid } from 'nanoid';
import request from 'supertest';
import AuthenticationTokenManager from '../../../Applications/security/AuthenticationTokenManager.js';
import pool from '../../database/postgres/pool.js';
import container from '../../container.js';
import createServer from '../createServer.js';

describe('forum HTTP functional API', () => {
  let app;
  let ownerId;
  let otherOwnerId;
  let ownerToken;
  let otherOwnerToken;
  let threadId;
  let otherThreadId;

  beforeEach(async () => {
    ownerId = `user-${nanoid()}`;
    otherOwnerId = `user-${nanoid()}`;
    const ownerUsername = `functional-${nanoid()}`;
    const otherUsername = `functional-${nanoid()}`;
    await pool.query(
      'INSERT INTO users (id, username, password, fullname) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
      [ownerId, ownerUsername, 'hash', 'Owner', otherOwnerId, otherUsername, 'hash', 'Other'],
    );

    const tokenManager = container.getInstance(AuthenticationTokenManager.name);
    ownerToken = await tokenManager.createAccessToken({ id: ownerId, username: ownerUsername });
    otherOwnerToken = await tokenManager.createAccessToken({ id: otherOwnerId, username: otherUsername });
    app = await createServer(container);

    threadId = `thread-${nanoid()}`;
    otherThreadId = `thread-${nanoid()}`;
    await pool.query(
      `INSERT INTO threads (id, title, body, owner)
        VALUES ($1, 'Functional thread', 'Thread body', $2),
          ($3, 'Other thread', 'Other body', $2)`,
      [threadId, ownerId, otherThreadId],
    );
  });

  afterEach(async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::varchar[])', [[ownerId, otherOwnerId]]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should create and read a thread, reject invalid access, and return 404 for missing threads', async () => {
    const noToken = await request(app).post('/threads').send({ title: 'title', body: 'body' });
    expect(noToken.status).toBe(401);
    expect(noToken.body.message).toBe('Missing authentication');

    for (const payload of [
      null,
      {},
      { title: ' ', body: 'body' },
      { title: 'title', body: 123 },
    ]) {
      const invalid = await request(app)
        .post('/threads')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(payload);
      expect(invalid.status).toBe(400);
      expect(invalid.body.status).toBe('fail');
      expect(invalid.body.message).not.toBe('');
    }

    const created = await request(app)
      .post('/threads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Created thread', body: 'Created body', owner: otherOwnerId });
    expect(created.status).toBe(201);
    expect(created.body.data.addedThread).toMatchObject({
      title: 'Created thread',
      owner: ownerId,
    });
    expect(created.body.data.addedThread.id).not.toBe('');

    const detail = await request(app).get(`/threads/${created.body.data.addedThread.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.thread).toMatchObject({
      id: created.body.data.addedThread.id,
      title: 'Created thread',
      body: 'Created body',
      username: expect.any(String),
      comments: [],
    });

    const missing = await request(app).get('/threads/missing-thread');
    expect(missing.status).toBe(404);
    expect(missing.body.status).toBe('fail');
    expect(missing.body.message).not.toBe('');
  });

  it('should validate comment resources, enforce ownership, and soft-delete comments', async () => {
    const anonymous = await request(app).post(`/threads/${threadId}/comments`).send({ content: 'comment' });
    expect(anonymous.status).toBe(401);

    for (const payload of [null, {}, { content: ' \t ' }, { content: 123 }]) {
      const invalid = await request(app)
        .post(`/threads/${threadId}/comments`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(payload);
      expect(invalid.status).toBe(400);
      expect(invalid.body.status).toBe('fail');
      expect(invalid.body.message).not.toBe('');
    }

    const missingThread = await request(app)
      .post('/threads/missing-thread/comments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'comment' });
    expect(missingThread.status).toBe(404);

    const created = await request(app)
      .post(`/threads/${threadId}/comments`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ content: 'owned comment' });
    expect(created.status).toBe(201);
    const commentId = created.body.data.addedComment.id;
    expect(created.body.data.addedComment.owner).toBe(otherOwnerId);

    const wrongParent = await request(app)
      .delete(`/threads/${otherThreadId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(wrongParent.status).toBe(404);

    const forbidden = await request(app)
      .delete(`/threads/${threadId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.status).toBe('fail');
    expect(forbidden.body.message).not.toBe('');

    const missing = await request(app)
      .delete(`/threads/${threadId}/comments/missing-comment`)
      .set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(missing.status).toBe(404);

    const deleted = await request(app)
      .delete(`/threads/${threadId}/comments/${commentId}`)
      .set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ status: 'success' });

    const persisted = await pool.query(
      'SELECT id, is_delete FROM comments WHERE id = $1',
      [commentId],
    );
    expect(persisted.rows).toEqual([{ id: commentId, is_delete: true }]);

    const detail = await request(app).get(`/threads/${threadId}`);
    expect(detail.body.data.thread.comments).toMatchObject([
      { id: commentId, content: '**komentar telah dihapus**', replies: [] },
    ]);
  });

  it('should enforce reply parentage and ownership while retaining deleted replies', async () => {
    const commentResponse = await request(app)
      .post(`/threads/${threadId}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'reply parent' });
    const commentId = commentResponse.body.data.addedComment.id;

    const anonymous = await request(app)
      .post(`/threads/${threadId}/comments/${commentId}/replies`)
      .send({ content: 'reply' });
    expect(anonymous.status).toBe(401);

    const missingThread = await request(app)
      .post(`/threads/missing-thread/comments/${commentId}/replies`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ content: 'reply' });
    expect(missingThread.status).toBe(404);

    const missingComment = await request(app)
      .post(`/threads/${threadId}/comments/missing-comment/replies`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ content: 'reply' });
    expect(missingComment.status).toBe(404);

    const unrelatedParent = await request(app)
      .post(`/threads/${otherThreadId}/comments/${commentId}/replies`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ content: 'reply' });
    expect(unrelatedParent.status).toBe(404);

    for (const payload of [null, {}, { content: '  ' }, { content: false }]) {
      const invalid = await request(app)
        .post(`/threads/${threadId}/comments/${commentId}/replies`)
        .set('Authorization', `Bearer ${otherOwnerToken}`)
        .send(payload);
      expect(invalid.status).toBe(400);
      expect(invalid.body.status).toBe('fail');
      expect(invalid.body.message).not.toBe('');
    }

    const created = await request(app)
      .post(`/threads/${threadId}/comments/${commentId}/replies`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({ content: 'created reply' });
    expect(created.status).toBe(201);
    const replyId = created.body.data.addedReply.id;
    expect(created.body.data.addedReply.owner).toBe(otherOwnerId);

    const missingReply = await request(app)
      .delete(`/threads/${threadId}/comments/${commentId}/replies/missing-reply`)
      .set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(missingReply.status).toBe(404);

    const wrongComment = await request(app)
      .delete(`/threads/${threadId}/comments/missing-comment/replies/${replyId}`)
      .set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(wrongComment.status).toBe(404);

    const forbidden = await request(app)
      .delete(`/threads/${threadId}/comments/${commentId}/replies/${replyId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(forbidden.status).toBe(403);

    const deleted = await request(app)
      .delete(`/threads/${threadId}/comments/${commentId}/replies/${replyId}`)
      .set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ status: 'success' });

    const persisted = await pool.query(
      'SELECT id, is_delete FROM replies WHERE id = $1',
      [replyId],
    );
    expect(persisted.rows).toEqual([{ id: replyId, is_delete: true }]);

    const detail = await request(app).get(`/threads/${threadId}`);
    expect(detail.body.data.thread.comments[0].replies).toMatchObject([
      { id: replyId, content: '**balasan telah dihapus**' },
    ]);
  });
});
