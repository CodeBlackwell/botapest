default:
    @just --list

# Run the city for ../SPICE on http://localhost:4242 (auto-kills stale servers)
dev:
    uv run botapest --repo ../SPICE

# Install hooks into ~/.claude/settings.json (new sessions report in)
attach:
    uv run botapest attach

# Remove the city's hooks
detach:
    uv run botapest detach
