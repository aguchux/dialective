import yaml

_REGISTRY_PATH = "/app/models/registry.yaml"


class UnsupportedDialectError(Exception):
    pass


def load_registry(path: str = _REGISTRY_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def resolve_model_path(dialect_tag: str, registry: dict) -> str:
    entry = registry.get(dialect_tag)
    if entry is None:
        raise UnsupportedDialectError(dialect_tag)
    return entry["path"]
