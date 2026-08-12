# PR #34 OAuth provider upgrade investigation

Last updated: 2026-08-12

## Symptom

`@cloudflare/workers-oauth-provider` 0.10 rejects test requests because the
configured authorization server is derived from `http://localhost`.

## Hypotheses and confidence

- Confirmed (1.0): `authorization_servers` now accepts only HTTPS issuer URLs.
  Reproduced with 141 failing tests and the provider constructor stack trace.
- Rejected (0.0): the failure is flaky. The exception is deterministic before
  route handling, so rerunning the same CI revision cannot fix it.
- Confirmed (1.0): fixing only the test scheme exposes a second incompatibility.
  A fixed `resourceMetadata.resource` permits only that exact OAuth resource,
  but this Worker protects both the MCP and CLI API resource paths.

## Resolution

- Run Worker integration requests with an HTTPS origin, matching deployed
  Cloudflare Workers.
- Keep `authorization_servers` explicit and HTTPS.
- Omit the single fixed `resourceMetadata.resource`, allowing OAuth grants and
  tokens to bind independently to the MCP or CLI API resource requested by the
  client.
- Use a shared API display name because the metadata applies to both protected
  resources.
- Verify MCP protected-resource discovery through its path-specific metadata
  endpoint.

## Sources

- [Cloudflare workers-oauth-provider README](https://github.com/cloudflare/workers-oauth-provider)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728)
- [RFC 8707: Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707)
