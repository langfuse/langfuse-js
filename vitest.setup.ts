import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env"), quiet: true });

// AutoEvals defaults to Braintrust's proxy unless this is set.
// See https://github.com/braintrustdata/autoevals#using-other-ai-providers
process.env.OPENAI_BASE_URL ??= "https://api.openai.com/v1";
