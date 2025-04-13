import type { ProcessEnv } from 'node:process';

export function validateEnvironment(requiredEnvVars: string[]) {
  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
  }
  return process.env as { [key: string]: string };
}

export function logAgentDetails(address: string, inboxId: string, env: string) {
  console.log("XMTP Agent Details:");
  console.log(`Address: ${address}`);
  console.log(`Inbox ID: ${inboxId}`);
  console.log(`Environment: ${env}`);
} 