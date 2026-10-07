import NewReply from '../NewReply.js';

describe('NewReply entity', () => {
  it.each([undefined, null, [], {}])(
    'should reject a missing or invalid payload: %s',
    (payload) => {
      expect(() => new NewReply(payload)).toThrowError(
        'NEW_REPLY.NOT_CONTAIN_NEEDED_PROPERTY',
      );
    },
  );

  it('should throw error when payload does not contain needed property', () => {
    // Arrange
    const payload = {};

    // Action & Assert
    expect(() => new NewReply(payload)).toThrowError(
      'NEW_REPLY.NOT_CONTAIN_NEEDED_PROPERTY',
    );
  });

  it('should throw error when payload does not meet data type specification', () => {
    // Arrange
    const payload = {
      content: 123,
    };

    // Action & Assert
    expect(() => new NewReply(payload)).toThrowError(
      'NEW_REPLY.NOT_MEET_DATA_TYPE_SPECIFICATION',
    );
  });

  it('should create NewReply object correctly', () => {
    // Arrange
    const payload = {
      content: 'sebuah balasan',
    };

    // Action
    const newReply = new NewReply(payload);

    // Assert
    expect(newReply.content).toEqual(payload.content);
  });

  it('should reject whitespace-only content', () => {
    expect(() => new NewReply({ content: '\n' })).toThrowError(
      'NEW_REPLY.NOT_CONTAIN_NEEDED_PROPERTY',
    );
  });
});
