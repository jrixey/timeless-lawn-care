// Loads .env for standalone scripts (tsx) so process.env is populated the same
// way Next.js would. Imported first by every script.
import { config } from "dotenv";
config();
