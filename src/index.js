import { buildServer } from "./server.js";
import { config } from "./config.js";

const app = buildServer();
app
  .listen({ host: config.host, port: config.port })
  .then(address => {
    console.log(`listening on ${address}`);
  })
  .catch(error => {
    console.error("failed to start server", error);
    process.exit(1);
  });
