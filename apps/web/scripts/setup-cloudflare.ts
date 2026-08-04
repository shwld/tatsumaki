#!/usr/bin/env bun
import { pathToFileURL } from "node:url";
import { setupCloudflare, type SetupOptions } from "./cloudflare-setup";

function usage(): string {
  return `Set up tatsumaki in your Cloudflare account without forking the repository.

Usage:
  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \\
  CLOUDFLARE_ACCESS_TEAM_DOMAIN=team.cloudflareaccess.com \\
  bun apps/web/scripts/setup-cloudflare.ts --allow-email you@example.com [options]

Options:
  --allow-email <email>    Allow an email address through Access (repeatable)
  --allow-domain <domain>  Allow an email domain through Access (repeatable)
  --with-staging           Also create an isolated staging environment
  --staging-only           Create or update only the isolated staging environment
  --name-prefix <name>     Resource name prefix (default: tatsumaki)
  --dry-run                Print the plan without contacting Cloudflare
  --help                   Show this help
`;
}

export function parseArguments(
  args: string[],
  environment: Record<string, string | undefined>,
): SetupOptions {
  const options: SetupOptions = {
    accountId: environment.CLOUDFLARE_ACCOUNT_ID,
    apiToken: environment.CLOUDFLARE_API_TOKEN,
    teamDomain: environment.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    allowEmails: [],
    allowDomains: [],
    withStaging: false,
    stagingOnly: false,
    dryRun: false,
    namePrefix: "tatsumaki",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--with-staging") options.withStaging = true;
    else if (argument === "--staging-only") options.stagingOnly = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--allow-email")
      options.allowEmails.push(requiredValue(args, ++index, argument));
    else if (argument === "--allow-domain")
      options.allowDomains.push(requiredValue(args, ++index, argument));
    else if (argument === "--name-prefix")
      options.namePrefix = requiredValue(args, ++index, argument);
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function requiredValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("--"))
    throw new Error(`${option} requires a value.`);
  return value;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.includes("--help")) {
    console.log(usage());
    process.exit(0);
  }
  try {
    await setupCloudflare(parseArguments(process.argv.slice(2), process.env));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(
      "\nRun with --help for usage or --dry-run to inspect the plan.",
    );
    process.exit(1);
  }
}
