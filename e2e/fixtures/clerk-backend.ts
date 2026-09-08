// Local provider fixture. The app still verifies real signed JWTs through Clerk's middleware.
const json = (value: unknown) =>
  Response.json(value, { headers: { "Content-Type": "application/json" } })
const invitations: Array<{ email_address: string; redirect_url: string }> = []
Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.SAKEKEEP_CLERK_FIXTURE_PORT),
  async fetch(request) {
    const path = new URL(request.url).pathname
    if (path === "/health") return new Response("ok")
    if (path === "/test/invitations") return json(invitations)
    const match = /^\/v1\/users\/(user_[a-z_]+)$/.exec(path)
    if (match)
      return json({
        object: "user",
        id: match[1],
        first_name: match[1],
        email_addresses: [
          {
            id: "email_test",
            linked_to: [],
            email_address: `${match[1]}@example.com`,
            verification: { status: match[1] === "user_unverified" ? "unverified" : "verified" },
          },
        ],
        phone_numbers: [],
        web3_wallets: [],
        external_accounts: [],
        primary_email_address_id: "email_test",
      })
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
