import CommentLikeRepository from '../CommentLikeRepository.js';

describe('CommentLikeRepository interface', () => {
  it('should throw an error when invoking abstract behavior', async () => {
    const repository = new CommentLikeRepository();

    await expect(
      repository.withCommentLock('', '', () => undefined),
    ).rejects.toThrowError('COMMENT_LIKE_REPOSITORY.METHOD_NOT_IMPLEMENTED');
    await expect(repository.getLike('', '')).rejects.toThrowError(
      'COMMENT_LIKE_REPOSITORY.METHOD_NOT_IMPLEMENTED',
    );
    await expect(repository.addLike('', '')).rejects.toThrowError(
      'COMMENT_LIKE_REPOSITORY.METHOD_NOT_IMPLEMENTED',
    );
    await expect(repository.removeLike('', '')).rejects.toThrowError(
      'COMMENT_LIKE_REPOSITORY.METHOD_NOT_IMPLEMENTED',
    );
    await expect(repository.countLikes('')).rejects.toThrowError(
      'COMMENT_LIKE_REPOSITORY.METHOD_NOT_IMPLEMENTED',
    );
  });
});
