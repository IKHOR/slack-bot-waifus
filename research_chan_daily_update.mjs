// Back-compat wrapper: call the new research daily update script
import { run } from "./bots/research/daily_update.mjs";

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
