import { clerkClient } from "@clerk/tanstack-react-start/server"
import { z } from "zod"
import { Pool } from "pg"

// Run explicitly against the intended environment before opening registration.
const email = z
  .email()
  .parse(process.argv[2] ?? "patriksimms@outlook.de")
  .toLowerCase()
const secret = z.string().min(1).parse(process.env.CLERK_SECRET_KEY)
const pool = new Pool({ connectionString: z.url().parse(process.env.DATABASE_URL) })

try {
  const { data } = await clerkClient({ secretKey: secret }).users.getUserList({
    emailAddress: [email],
    limit: 2,
  })
  const matches = data.filter((user) =>
    user.emailAddresses.some(
      (address) =>
        address.emailAddress.toLowerCase() === email && address.verification?.status === "verified"
    )
  )
  if (matches.length !== 1)
    throw new Error(
      "Expected exactly one Clerk account with the verified owner email. No projects changed."
    )
  const updated = await pool.query(
    "UPDATE projects SET owner_user_id = $1 WHERE owner_user_id IS NULL RETURNING id",
    [matches[0]!.id]
  )
  console.log(`Assigned ${updated.rowCount} unowned projects to the verified account for ${email}.`)
} finally {
  await pool.end()
}
