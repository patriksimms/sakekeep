import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { UsersIcon } from "lucide-react"
import * as m from "#/paraglide/messages.js"
import {
  canManageProject,
  type CollaboratorRole,
  type ProjectAccess,
} from "#/domain/project-access"
import { api } from "#/lib/api"
import { captureAnalyticsEvent } from "#/lib/analytics"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog"
import { Field, FieldGroup, FieldLabel } from "./ui/field"
import { Input } from "./ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./ui/select"

function RoleSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: CollaboratorRole
  onChange: (role: CollaboratorRole) => void
  disabled?: boolean
  label: string
}) {
  const items = [
    { value: "organizer", label: m.access_organizer() },
    { value: "editor", label: m.access_editor() },
  ]
  return (
    <Select
      value={value}
      disabled={disabled}
      items={items}
      onValueChange={(role) => {
        if (role === "organizer" || role === "editor") onChange(role)
      }}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function Collaborators({ projectId, access }: { projectId: string; access: ProjectAccess }) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CollaboratorRole>("editor")
  const [invitationUrl, setInvitationUrl] = useState("")
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: (
      input:
        | { action: "invite"; email: string; role: CollaboratorRole }
        | { action: "link" }
        | { action: "change"; userId: string; role: CollaboratorRole | null }
        | { action: "revoke"; invitationId: string }
        | { action: "transfer"; userId: string }
    ) =>
      api<{ url: string } | undefined>(`/api/projects/${projectId}/collaborators`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (result, input) => {
      if (result?.url) setInvitationUrl(result.url)
      captureAnalyticsEvent("collaborators:changed", {
        action: input.action,
        role: "role" in input ? input.role : null,
      })
      if (input.action === "invite") setEmail("")
      toast.success(input.action === "invite" ? m.access_invited() : m.access_saved())
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project-access", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
      ])
    },
    onError: (error) => toast.error(error.message),
  })
  if (!canManageProject(access.role)) return null
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <UsersIcon data-icon="inline-start" />
        {m.access_collaborators()}
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.access_collaborators()}</DialogTitle>
          <DialogDescription>{m.access_roles_help()}</DialogDescription>
        </DialogHeader>
        {access.role === "owner" && <p className="text-sm">{m.access_owner_you()}</p>}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            change.mutate({ action: "invite", email, role })
          }}
        >
          <FieldGroup className="sm:flex-row sm:items-end">
            <Field>
              <FieldLabel htmlFor="collaborator-email">{m.access_email()}</FieldLabel>
              <Input
                id="collaborator-email"
                type="email"
                required
                maxLength={320}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field className="sm:w-40">
              <FieldLabel>{m.access_role()}</FieldLabel>
              <RoleSelect value={role} onChange={setRole} label={m.access_role()} />
            </Field>
            <Button type="submit" disabled={change.isPending || !email.trim()}>
              {m.access_invite()}
            </Button>
          </FieldGroup>
        </form>
        <p className="text-sm text-muted-foreground">{m.invitation_link_warning()}</p>
        <Button
          variant="outline"
          disabled={change.isPending}
          onClick={() => change.mutate({ action: "link" })}
        >
          {m.invitation_copy_link()}
        </Button>
        {invitationUrl && (
          <Field>
            <FieldLabel htmlFor="invitation-link">{m.invitation_link_label()}</FieldLabel>
            <Input
              data-ph-no-capture
              id="invitation-link"
              value={invitationUrl}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invitationUrl)
                  toast.success(m.invitation_copied())
                } catch {
                  toast.error(m.invitation_copy_failed())
                }
              }}
            >
              {m.invitation_copy()}
            </Button>
          </Field>
        )}
        {access.members.map((member) => (
          <div key={member.userId} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 break-all text-sm">{member.email}</span>
            <RoleSelect
              value={member.role}
              label={`${m.access_role()}: ${member.email}`}
              disabled={change.isPending}
              onChange={(nextRole) =>
                change.mutate({ action: "change", userId: member.userId, role: nextRole })
              }
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={change.isPending}
              onClick={() => change.mutate({ action: "change", userId: member.userId, role: null })}
            >
              {m.access_remove()}
            </Button>
            {access.role === "owner" && (
              <Button
                variant="outline"
                size="sm"
                disabled={change.isPending}
                onClick={() => {
                  if (window.confirm(m.access_transfer_confirm({ email: member.email })))
                    change.mutate({ action: "transfer", userId: member.userId })
                }}
              >
                {m.access_transfer()}
              </Button>
            )}
          </div>
        ))}
        {access.invitations.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{m.access_pending()}</h3>
            {access.invitations.map((invite) => (
              <div key={invite.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 break-all">
                  {invite.email ?? m.invitation_link_label()}
                </span>
                <span>{invite.role === "editor" ? m.access_editor() : m.access_organizer()}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={change.isPending}
                  onClick={() => change.mutate({ action: "revoke", invitationId: invite.id })}
                >
                  {m.access_revoke()}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
