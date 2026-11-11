import dotenv from "dotenv";
// Resolve from the repository, not a workspace process's current directory.
// Existing deployment environment variables always take precedence.
dotenv.config({ path: new URL("../../.env", import.meta.url), quiet: true });
