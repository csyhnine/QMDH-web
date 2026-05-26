# Product Boundary

## 2026-05-25 Active Baseline

This document records the current active product boundary when older docs still contain historical project-centered wording.

### Roles

- The active runtime role model is `admin` and `designer`.
- Legacy `owner` and `ops` values are compatibility aliases that normalize to `admin` at auth boundaries.
- Backend management views are intended only for preset admin accounts.

### Visibility

- Studio history is account-owned for every role.
- Every account only sees its own task history in the studio history surface.
- Every account only sees assets generated from its own tasks in the studio history surface.
- Shared access to the same project code does not imply shared history visibility.
- Admins retain global visibility only through dedicated backend management surfaces, not through studio history cards.

### Project Semantics

- Projects still exist, but they are no longer collaboration spaces with automatic shared history cards.
- A project acts as a personal task container or grouping unit within a user's scope.
- In the active UI, this should be understood as a "personal project" or "task group", not a shared team project.
- Internal `project_code` values remain as compatibility identifiers, but new personal projects should not require users or admins to manage those codes manually.
- Newly created personal projects are expected to be managed by their owner account; older legacy projects may still remain admin-managed until data is migrated.
- Project membership management is not an active product capability.

### Active Surface

- `/admin/dashboard`, `/admin/models`, `/admin/users`, and `/admin/settings` are active admin surfaces.
- `/admin/projects` has been removed from the active frontend routing surface.
- Project-member management UI and APIs are no longer part of the active product surface.

### Interpretation Rule

- If an older document says `owner`, `ops`, `/admin/projects`, "project members", or "shared project history", treat that as historical unless the current code still proves it.
