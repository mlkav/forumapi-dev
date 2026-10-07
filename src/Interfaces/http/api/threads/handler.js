import AddThreadUseCase from '../../../../Applications/use_case/AddThreadUseCase.js';
import GetThreadDetailUseCase from '../../../../Applications/use_case/GetThreadDetailUseCase.js';
import AddCommentUseCase from '../../../../Applications/use_case/AddCommentUseCase.js';
import DeleteCommentUseCase from '../../../../Applications/use_case/DeleteCommentUseCase.js';
import AddReplyUseCase from '../../../../Applications/use_case/AddReplyUseCase.js';
import DeleteReplyUseCase from '../../../../Applications/use_case/DeleteReplyUseCase.js';
import ToggleCommentLikeUseCase from '../../../../Applications/use_case/ToggleCommentLikeUseCase.js';

class ThreadsHandler {
  constructor(container) {
    this._container = container;
    this.postThreadHandler = this.postThreadHandler.bind(this);
    this.getThreadHandler = this.getThreadHandler.bind(this);
    this.postCommentHandler = this.postCommentHandler.bind(this);
    this.deleteCommentHandler = this.deleteCommentHandler.bind(this);
    this.postReplyHandler = this.postReplyHandler.bind(this);
    this.deleteReplyHandler = this.deleteReplyHandler.bind(this);
    this.toggleCommentLikeHandler = this.toggleCommentLikeHandler.bind(this);
  }

  async postThreadHandler(req, res, next) {
    try {
      const useCase = this._container.getInstance(AddThreadUseCase.name);
      const addedThread = await useCase.execute(req.body, req.auth.id);
      res.status(201).json({ status: 'success', data: { addedThread } });
    } catch (error) {
      next(error);
    }
  }

  async getThreadHandler(req, res, next) {
    try {
      const useCase = this._container.getInstance(GetThreadDetailUseCase.name);
      const thread = await useCase.execute(req.params.threadId);
      res.json({ status: 'success', data: { thread } });
    } catch (error) {
      next(error);
    }
  }

  async postCommentHandler(req, res, next) {
    try {
      const useCase = this._container.getInstance(AddCommentUseCase.name);
      const addedComment = await useCase.execute(
        req.body,
        req.params.threadId,
        req.auth.id,
      );
      res.status(201).json({ status: 'success', data: { addedComment } });
    } catch (error) {
      next(error);
    }
  }

  async deleteCommentHandler(req, res, next) {
    try {
      const useCase = this._container.getInstance(DeleteCommentUseCase.name);
      await useCase.execute(
        req.params.threadId,
        req.params.commentId,
        req.auth.id,
      );
      res.json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }

  async postReplyHandler(req, res, next) {
    try {
      const useCase = this._container.getInstance(AddReplyUseCase.name);
      const addedReply = await useCase.execute(
        req.body,
        req.params.threadId,
        req.params.commentId,
        req.auth.id,
      );
      res.status(201).json({ status: 'success', data: { addedReply } });
    } catch (error) {
      next(error);
    }
  }

  async deleteReplyHandler(req, res, next) {
    try {
      const useCase = this._container.getInstance(DeleteReplyUseCase.name);
      await useCase.execute(
        req.params.threadId,
        req.params.commentId,
        req.params.replyId,
        req.auth.id,
      );
      res.json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }

  async toggleCommentLikeHandler(req, res, next) {
    try {
      const useCase = this._container.getInstance(
        ToggleCommentLikeUseCase.name,
      );
      await useCase.execute(
        req.params.threadId,
        req.params.commentId,
        req.auth.id,
      );
      res.json({ status: 'success' });
    } catch (error) {
      next(error);
    }
  }
}

export default ThreadsHandler;
