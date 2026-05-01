import { Agent, CredentialSession } from "@atproto/api";

// Cached per Worker isolate — avoids re-authenticating on every request.
let agent: Agent | null = null;

export async function getAgent(
  handle: string,
  password: string,
): Promise<Agent> {
  if (agent) return agent;

  const session = new CredentialSession(new URL("https://bsky.social"));
  await session.login({ identifier: handle, password });
  agent = new Agent(session);
  return agent;
}
