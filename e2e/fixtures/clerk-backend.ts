// Local provider fixture. The app still verifies real signed JWTs through Clerk's middleware.
const json = (value: unknown) =>
  Response.json(value, { headers: { "Content-Type": "application/json" } })
const invitations: Array<{ email_address: string; redirect_url: string }> = []
const user = (id: string) => ({
  object: "user",
  id,
  first_name: id,
  email_addresses: [
    {
      id: "email_test",
      linked_to: [],
      email_address: `${id}@example.com`,
      verification: { status: id === "user_unverified" ? "unverified" : "verified" },
    },
  ],
  phone_numbers: [],
  web3_wallets: [],
  external_accounts: [],
  primary_email_address_id: "email_test",
})
Bun.serve({
  // Loopback for the local e2e run; the production smoke runs this in a container of its own
  // and the application has to reach it across the compose network.
  hostname: process.env.SAKEKEEP_CLERK_FIXTURE_HOST ?? "127.0.0.1",
  port: Number(process.env.SAKEKEEP_CLERK_FIXTURE_PORT),
  async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/health") return new Response("ok")
    if (path === "/test/invitations") return json(invitations)
    // The production smoke runs the shipped owner backfill, which looks an account up by
    // email. The SDK asks for the page and its count, so both have to answer.
    if ((path === "/v1/users" || path === "/v1/users/count") && request.method === "GET") {
      const email = new URL(request.url).searchParams.get("email_address")
      const id = email?.split("@")[0] ?? ""
      const matches = id.startsWith("user_") ? [user(id)] : []
      return json(
        path.endsWith("/count") ? { object: "total_count", total_count: matches.length } : matches
      )
    }
    const match = /^\/v1\/users\/(user_[a-z_]+)$/.exec(path)
    if (match) return json(user(match[1]!))
    if (path === "/v1/invitations" && request.method === "POST") {
      const input = await request.json()
      invitations.push(input)
      return json({
        object: "invitation",
        id: crypto.randomUUID(),
        email_address: input.email_address,
        status: "pending",
      })
    }
    return new Response("Not found", { status: 404 })
  },
})
