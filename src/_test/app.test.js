import express from 'express';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { isEntrypoint, runApp, startServer } from '../app.js';

describe('application entry point', () => {
  it('should identify when the application module is the process entry point', () => {
    const modulePath = fileURLToPath(import.meta.url).replace('/_test/app.test.js', '/app.js');
    const moduleUrl = new URL('../app.js', import.meta.url).href;

    expect(isEntrypoint(moduleUrl, modulePath)).toBe(true);
    expect(isEntrypoint(moduleUrl, `${modulePath}.other`)).toBe(false);
    expect(isEntrypoint(moduleUrl, undefined)).toBe(false);
  });

  it('should start only when the application module is the process entry point', async () => {
    const start = vi.fn().mockResolvedValue('server');
    const moduleUrl = new URL('../app.js', import.meta.url).href;
    const modulePath = fileURLToPath(new URL('../app.js', import.meta.url));

    await expect(runApp(moduleUrl, undefined, start)).resolves.toBeUndefined();
    await expect(runApp(moduleUrl, modulePath, start)).resolves.toBe('server');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('should create and log a listening HTTP server', async () => {
    const logger = { log: vi.fn() };
    const server = await startServer({
      serverFactory: async () => express(),
      serviceContainer: {},
      applicationConfig: { host: '127.0.0.1', port: 0 },
      logger,
    });

    expect(server.address().port).toBeGreaterThan(0);
    expect(logger.log).toHaveBeenCalledWith(
      `server start at http://127.0.0.1:${server.address().port}`,
    );
    await new Promise((resolve) => server.close(resolve));
  });

  it('should reject when the HTTP server cannot listen', async () => {
    const error = Object.assign(new Error('address in use'), { code: 'EADDRINUSE' });
    const app = {
      listen: () => {
        const server = new EventEmitter();
        queueMicrotask(() => server.emit('error', error));
        return server;
      },
    };

    await expect(startServer({
      serverFactory: async () => app,
      applicationConfig: { host: '127.0.0.1', port: 3000 },
      logger: { log: vi.fn() },
    })).rejects.toBe(error);
  });

  it('should use the configured port when the server has no TCP address', async () => {
    const server = new EventEmitter();
    server.address = vi.fn().mockReturnValue(null);
    const logger = { log: vi.fn() };
    const app = {
      listen: (_port, _host, callback) => {
        queueMicrotask(callback);
        return server;
      },
    };

    await expect(startServer({
      serverFactory: async () => app,
      applicationConfig: { host: 'localhost', port: '3000' },
      logger,
    })).resolves.toBe(server);
    expect(logger.log).toHaveBeenCalledWith('server start at http://localhost:3000');
  });
});
