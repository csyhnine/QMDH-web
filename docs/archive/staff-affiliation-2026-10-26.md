# Personnel affiliation and account group consolidation

Planning unit and employment affiliation are separate. Staff can be internal, external (with employer), or unverified; existing rows and account imports default to unverified. External staff can participate in the same unit's projects without website accounts or company grants. Cross-unit restrictions still apply. Older clients editing other staff attributes preserve verified affiliation.

The personnel roster displays active internal/external/unverified counts and filters. Personnel scheduling, project work assignment, and overview load cards display affiliation. Unit chooser counts active staff. Account edits normalize the retired fourth-institute group to the second institute.

Production correction is a separately audited transaction based on the user's supplied October 26 weekly table and explicit departure correction. Keep personal names and imported business data in private evidence, outside Git. Preserve staff IDs, source account links, project documents, and revisions. Add missing planning personnel without creating login accounts. Disable the departed person's planning entry and linked login; retain history. Rename the 13 old fourth-institute account group rows into the second institute. Do not infer stage dates or hours from aggregate workload counts.

Validation: 26 targeted backend tests; 10 planning frontend tests; changed-file TypeScript diagnostics 0; Vite build; three browser scenarios covering affiliation editing, external assignment, and a 390px personnel form. Known existing Vite chunk-size warning remains.

Release state and image identities will be recorded after isolated PostgreSQL and public deployment verification. Preserve pending/frozen review decisions; no historical backfill, paid generation, GPU execution, or unrelated changes.
