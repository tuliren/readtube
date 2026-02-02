import argparse

from app.main import app


def main() -> None:
    """
    yarn script app/scripts/example_script.py -- --param <value>
    """
    parser = argparse.ArgumentParser(
        description="Call OpenAI API with optional file input"
    )
    parser.add_argument("--param", type=str, help="An example parameter")

    args = parser.parse_args()
    param = args.param

    print(f"FastAPI App Title: {app.title}")
    print(f"FastAPI App Version: {app.version}")
    print(f"Script param: {param}")
    print("Available routes:")
    for route in app.routes:
        print(f"  {route.path} [{', '.join(route.methods)}]")  # type: ignore[attr-defined]


if __name__ == "__main__":
    main()
