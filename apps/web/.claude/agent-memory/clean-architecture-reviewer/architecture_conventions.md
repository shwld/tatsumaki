---
name: architecture_conventions
description: tatsumaki project layer structure, DI patterns, and naming conventions discovered during My Work feature review
type: reference
---

## Layer Structure
- `domain/entities/` - Domain entities (Story, Project, etc.)
- `domain/repositories/` - Repository interfaces (ports)
- `infrastructure/db/repositories/` - D1 (Cloudflare) repository implementations (adapters)
- `application/usecases/` - Use case functions (not classes); receive repository interfaces as parameters
- `presentation/routes/` - Hono route handlers; instantiate concrete repositories directly (no DI container)
- `client/screens/` - React screen components
- `client/types/` - Client-side type definitions (separate from domain types)
- `client/components/` - Shared React components
- `client/lib/` - Client utility functions

## Dependency Injection Pattern
- No DI container; route handlers instantiate `D1*Repository(c.env.DB)` and pass to use cases
- Use cases are pure functions taking repository interfaces as arguments (constructor injection equivalent)
- This is consistent across all routes

## Conventions
- Use cases: standalone async functions (not classes), return `Result<T, Error>` via neverthrow
- Repository interfaces: defined in domain layer, implementations in infrastructure
- Client types: duplicated from domain types (separate client/types/ vs domain/entities/)
- Error handling: typed error constants exported from repository interfaces
- Route pattern: Hono routes in `presentation/routes/`, registered in `src/index.ts`
