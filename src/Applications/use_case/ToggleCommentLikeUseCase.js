class ToggleCommentLikeUseCase {
  constructor({ threadRepository, commentRepository, commentLikeRepository }) {
    this._threadRepository = threadRepository;
    this._commentRepository = commentRepository;
    this._commentLikeRepository = commentLikeRepository;
  }

  async execute(threadId, commentId, userId) {
    await this._threadRepository.checkAvailabilityThread(threadId);
    await this._commentRepository.checkAvailabilityComment(commentId, threadId);

    return this._commentLikeRepository.withCommentLock(
      commentId,
      threadId,
      async (likeRepository) => {
        const existingLike = await likeRepository.getLike(userId, commentId);
        if (existingLike) {
          await likeRepository.removeLike(userId, commentId);
          return;
        }
        await likeRepository.addLike(userId, commentId);
      },
    );
  }
}

export default ToggleCommentLikeUseCase;
