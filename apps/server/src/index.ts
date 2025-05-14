import { loadConfig } from "./config.js";
import { buildServer } from "./server.js";

async function main() {
  const config = loadConfig();
  const app = buildServer(config);
  const host = "0.0.0.0";
  await app.listen({ port: config.PORT, host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
