// Refresh the Salesforce access token in .env.local from the sf CLI session.
import { execSync } from "node:child_process";
import fs from "node:fs";
const out = execSync("sf org display --target-org a@simple.company.partner --verbose --json").toString();
const r = JSON.parse(out).result;
let env = fs.readFileSync(".env.local", "utf8");
env = env.replace(/^SALESFORCE_ACCESS_TOKEN=.*$/m, `SALESFORCE_ACCESS_TOKEN=${r.accessToken}`)
         .replace(/^SALESFORCE_INSTANCE_URL=.*$/m, `SALESFORCE_INSTANCE_URL=${r.instanceUrl}`);
fs.writeFileSync(".env.local", env);
console.log("refreshed SALESFORCE_ACCESS_TOKEN");
