import { createClient } from "@supabase/supabase-js";
import { createCredential } from "../lib/credentials-store";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from dashboard/.env
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("FATAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const supabaseAdmin = createClient(url, key, { auth: { persistSession: false } });

  console.log("Starting data migration of legacy Vobiz credentials...");

  // 1. Fetch all workspaces that have legacy vobiz_password set
  const { data: configs, error } = await supabaseAdmin
    .from("workspace_config")
    .select("business_id, vobiz_username, vobiz_password, sip_domain")
    .not("vobiz_password", "is", null);

  if (error) {
    console.error("Failed to fetch legacy configs:", error.message);
    process.exit(1);
  }

  if (!configs || configs.length === 0) {
    console.log("No legacy credentials found to migrate. Exiting.");
    process.exit(0);
  }

  console.log(`Found ${configs.length} workspaces to migrate.`);

  // 2. Migrate each one to the encrypted_credentials column
  for (const config of configs) {
    const { business_id, vobiz_username, vobiz_password, sip_domain } = config;
    try {
      console.log(`Migrating workspace ${business_id}...`);
      await createCredential(business_id, "Vobiz SIP Account", "customHeaders", {
        username: vobiz_username,
        password: vobiz_password,
        domain: sip_domain || "sip.vobiz.com",
      });
      console.log(`Successfully migrated credentials for workspace ${business_id}`);
    } catch (err: any) {
      console.error(`Failed to migrate workspace ${business_id}:`, err.message);
    }
  }

  console.log("Data migration complete. You can now run the cleanup migration to drop the plaintext columns.");
}

main().catch(console.error);
