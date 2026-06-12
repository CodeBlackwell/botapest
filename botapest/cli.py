"""botapest — run from any git repo to watch agents build its city."""
import argparse

import uvicorn

from . import hooks, server


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="botapest",
        description="Habbo-style visualization of Claude Code agents building your repo as a city.")
    parser.add_argument("command", nargs="?", default="serve", choices=["serve", "attach", "detach"],
                        help="serve the city (default), or attach/detach Claude Code hooks")
    parser.add_argument("--repo", default=".", help="git repo to map as the city (default: cwd)")
    parser.add_argument("--zone", help="zoning manifest (default: <repo>/.botapest.json, else auto-zoned)")
    parser.add_argument("--port", type=int, default=4242)
    args = parser.parse_args()

    if args.command == "attach":
        hooks.attach(args.port)
    elif args.command == "detach":
        hooks.detach()
    else:
        server.configure(args.repo, args.zone)
        print(f"Botapest City on http://localhost:{args.port} (repo: {args.repo})")
        uvicorn.run(server.app, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
