default:
    @just --list

# Run the hotel on http://localhost:4242 (auto-kills stale servers)
dev:
    -@lsof -ti :4242 | xargs kill 2>/dev/null
    uv run uvicorn server:app --port 4242

# Seed the city snapshot from a repo + zoning manifest (view at /city.html)
city repo zone='city/maisight.json':
    uv run python cityseed.py {{repo}} {{zone}} > static/city-data.json

# Install hooks into ~/.claude/settings.json (new sessions report in)
attach:
    uv run python hooks.py attach

# Remove the hotel's hooks
detach:
    uv run python hooks.py detach
