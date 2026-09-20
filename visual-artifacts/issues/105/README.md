# Invitation flow evidence

Matched captures at 1280 × 900, dark theme, English, using the real local app shell and seeded demo projects.

- `before-home.png`: project homepage before the change.
- `after-home.png`: Join project modal. Synthetic account and invitation preview, rendered by the production component inside the real homepage. This demonstrates appearance, not Clerk authentication.
- `after-dismissed.png`: same synthetic invitation after dismissal and reload. The modal remains closed and Join project is available.
- `before-collaborators.png` and `after-collaborators.png`: the same project and Collaborators dialog, before and after adding copied invitations and the forwarding warning.

The temporary account fixture was removed after capture. Server integration and API tests validate actual invitation authorization separately.
