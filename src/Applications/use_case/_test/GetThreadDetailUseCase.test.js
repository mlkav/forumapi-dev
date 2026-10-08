import { vi } from 'vitest';
import ThreadRepository from '../../../Domains/threads/ThreadRepository.js';
import CommentRepository from '../../../Domains/comments/CommentRepository.js';
import ReplyRepository from '../../../Domains/replies/ReplyRepository.js';
import GetThreadDetailUseCase from '../GetThreadDetailUseCase.js';

describe('GetThreadDetailUseCase', () => {
  it('should orchestrate get thread detail action correctly', async () => {
    // Arrange
    const threadId = 'thread-123';
    const mockThread = {
      id: 'thread-123',
      title: 'sebuah thread',
      body: 'sebuah body thread',
      date: '2021-08-08T07:19:09.775Z',
      username: 'dicoding',
    };

    const mockComments = [
      {
        id: 'comment-1',
        username: 'johndoe',
        date: '2021-08-08T07:22:33.555Z',
        content: 'sebuah comment 1',
        is_delete: false,
      },
      {
        id: 'comment-2',
        username: 'janedoe',
        date: '2021-08-08T07:26:33.555Z',
        content: 'sebuah comment 2',
        is_delete: true,
      },
    ];

    const mockReplies = [
      {
        id: 'reply-1',
        comment_id: 'comment-1',
        username: 'dicoding',
        date: '2021-08-08T08:07:01.522Z',
        content: 'sebuah balasan 1',
        is_delete: false,
      },
      {
        id: 'reply-2',
        comment_id: 'comment-1',
        username: 'alex',
        date: '2021-08-08T08:08:01.522Z',
        content: 'sebuah balasan 2',
        is_delete: true,
      },
    ];

    const mockThreadRepository = new ThreadRepository();
    const mockCommentRepository = new CommentRepository();
    const mockReplyRepository = new ReplyRepository();

    mockThreadRepository.getThreadById = vi.fn().mockImplementation(() => Promise.resolve(mockThread));
    mockCommentRepository.getCommentsByThreadId = vi.fn().mockImplementation(() => Promise.resolve(mockComments));
    mockReplyRepository.getRepliesByThreadId = vi.fn().mockImplementation(() => Promise.resolve(mockReplies));

    const getThreadDetailUseCase = new GetThreadDetailUseCase({
      threadRepository: mockThreadRepository,
      commentRepository: mockCommentRepository,
      replyRepository: mockReplyRepository,
    });

    // Action
    const threadDetail = await getThreadDetailUseCase.execute(threadId);

    // Assert
    expect(threadDetail).toEqual({
      id: 'thread-123',
      title: 'sebuah thread',
      body: 'sebuah body thread',
      date: '2021-08-08T07:19:09.775Z',
      username: 'dicoding',
      comments: [
        {
          id: 'comment-1',
          username: 'johndoe',
          date: '2021-08-08T07:22:33.555Z',
          content: 'sebuah comment 1',
          replies: [
            {
              id: 'reply-1',
              content: 'sebuah balasan 1',
              date: '2021-08-08T08:07:01.522Z',
              username: 'dicoding',
            },
            {
              id: 'reply-2',
              content: '**balasan telah dihapus**',
              date: '2021-08-08T08:08:01.522Z',
              username: 'alex',
            },
          ],
        },
        {
          id: 'comment-2',
          username: 'janedoe',
          date: '2021-08-08T07:26:33.555Z',
          content: '**komentar telah dihapus**',
          replies: [],
        },
      ],
    });
    expect(mockThreadRepository.getThreadById).toHaveBeenCalledWith(threadId);
    expect(mockCommentRepository.getCommentsByThreadId).toHaveBeenCalledWith(threadId);
    expect(mockReplyRepository.getRepliesByThreadId).toHaveBeenCalledWith(threadId);
  });
});
