// Minimal env so modules that import src/lib/env.ts are testable in isolation.
// DATABASE_URL is the only required var with no default; everything else in the
// schema has a safe default. We never connect — this just satisfies validation.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/greeneco_test";
