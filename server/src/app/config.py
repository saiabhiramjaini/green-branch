from dynaconf import Dynaconf
from pathlib import Path

# Get the root directory of the project
ROOT_DIR = Path(__file__).parent.parent.parent

settings = Dynaconf(
    envvar_prefix="DYNACONF",
    settings_files=[
        str(ROOT_DIR / "settings.toml"),
        str(ROOT_DIR / ".secrets.toml"),
    ],
    environments=True,
    env="development", # only this has to be changed according to environment
    merge_enabled=True,
)