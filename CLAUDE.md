# CLAUDE.md

Project instructions live in [AGENTS.md](AGENTS.md) so every coding agent reads the same file.

@AGENTS.md

## Claude-specific notes

- Another project's Temporal runs on this machine (`temporal` :7233, `temporal-ui` :8233).
  Never stop or modify those containers; this project only hammers `temporal-sim` and the
  `worker-*` containers from its own docker-compose.yml.
- Commit in small steps using Conventional Commits and push to `origin main` when asked.
