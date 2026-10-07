import NewThread from '../NewThread.js';

describe('NewThread entity', () => {
  it.each([undefined, null, [], {}])(
    'should reject a missing or invalid payload: %s',
    (payload) => {
      expect(() => new NewThread(payload)).toThrowError(
        'NEW_THREAD.NOT_CONTAIN_NEEDED_PROPERTY',
      );
    },
  );

  it('should throw error when payload does not contain needed property', () => {
    // Arrange
    const payload = {
      title: 'abc',
    };

    // Action & Assert
    expect(() => new NewThread(payload)).toThrowError(
      'NEW_THREAD.NOT_CONTAIN_NEEDED_PROPERTY',
    );
  });

  it('should throw error when payload does not meet data type specification', () => {
    // Arrange
    const payload = {
      title: 'abc',
      body: 123,
    };

    // Action & Assert
    expect(() => new NewThread(payload)).toThrowError(
      'NEW_THREAD.NOT_MEET_DATA_TYPE_SPECIFICATION',
    );
  });

  it('should create NewThread object correctly', () => {
    // Arrange
    const payload = {
      title: 'sebuah thread',
      body: 'sebuah body thread',
    };

    // Action
    const newThread = new NewThread(payload);

    // Assert
    expect(newThread.title).toEqual(payload.title);
    expect(newThread.body).toEqual(payload.body);
  });

  it('should reject whitespace-only values', () => {
    expect(() => new NewThread({ title: '  ', body: 'body' })).toThrowError(
      'NEW_THREAD.NOT_CONTAIN_NEEDED_PROPERTY',
    );
    expect(() => new NewThread({ title: 'title', body: '\t' })).toThrowError(
      'NEW_THREAD.NOT_CONTAIN_NEEDED_PROPERTY',
    );
  });
});
