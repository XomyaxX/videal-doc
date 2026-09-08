/** Shared SSH settings for office deploy scripts. Password is never hardcoded. */
export function requireSsh() {
  const host = process.env.SSH_HOST || "192.168.1.51";
  const username = process.env.SSH_USER || "v";
  const password = process.env.SSH_PASS;
  if (!password) {
    console.error("Set SSH_PASS before running deploy/ssh scripts. Optional: SSH_HOST, SSH_USER.");
    process.exit(1);
  }
  return { host, username, password };
}
