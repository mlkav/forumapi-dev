import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import createServer from './Infrastructures/http/createServer.js';
import container from './Infrastructures/container.js';
import config from './Commons/config.js';

export const isEntrypoint = (moduleUrl, entryPath) =>
  Boolean(entryPath) && pathToFileURL(resolve(entryPath)).href === moduleUrl;

export const runApp = async (
  moduleUrl,
  entryPath,
  serverStarter = startServer,
) => {
  if (isEntrypoint(moduleUrl, entryPath)) {
    return serverStarter();
  }
  return undefined;
};

export const startServer = async ({
  serverFactory = createServer,
  serviceContainer = container,
  applicationConfig = config.app,
  logger = console,
} = {}) => {
  const app = await serverFactory(serviceContainer);
  const { host, port } = applicationConfig;

  return new Promise((resolveServer, rejectServer) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort =
        typeof address === 'object' && address ? address.port : port;
      logger.log(`server start at http://${host}:${actualPort}`);
      resolveServer(server);
    });
    server.once('error', rejectServer);
  });
};

await runApp(import.meta.url, process.argv[1]);
