---
name: tatsumaki architecture overview
description: Layer structure, directory conventions, and patterns used in the tatsumaki web app
type: project
---

## Layer Structure (apps/web/src/)

- `domain/entities/` -- Domain entities (Project, Story, ProjectMember)
- `domain/repositories/` -- Repository interfaces (ports)
- `application/usecases/` -- Use cases (createProject, createStory, etc.), use neverthrow Result type
- `infrastructure/db/` -- D1 repository implementations (adapters)
- `presentation/routes/` -- Hono HTTP route handlers (maps use case errors to HTTP responses)
- `client/` -- React SPA (screens, components, hooks, lib, contexts, types)

**Why:** Understanding layer boundaries is critical for reviewing dependency direction and cohesion.
**How to apply:** When reviewing changes, verify imports respect domain -> application -> infrastructure/presentation direction. Client layer communicates via HTTP (fetch), not direct imports of server-side code.

## Client-side Patterns

- Screen components own state, API calls, and error handling (container pattern)
- Form components are pure/presentational, receiving all state and callbacks via props
- Error handling: `parseErrorMessage` extracts `{ error: string }` from responses
- Auth/forbidden errors handled via `useAuthError` context and `PermissionDenied` component
- StoryForm uses `validationError: string | null` (single banner), ProjectCreateForm uses `fieldErrors: Record<string, string>` (field-level)
- Validation: client-side required check + server 400 error parsing

## Server-side Patterns

- Use cases return `Result<T, ErrorType>` (neverthrow)
- Presentation routes map domain error types to HTTP status codes
- Error response format: `{ error: string }` -- no structured field-level error contract
