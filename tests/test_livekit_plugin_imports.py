import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _parse(relative_path: str) -> ast.AST:
    return ast.parse((ROOT / relative_path).read_text(encoding="utf-8"))


def _function(node: ast.AST, name: str) -> ast.FunctionDef:
    for child in ast.walk(node):
        if isinstance(child, ast.FunctionDef) and child.name == name:
            return child
    raise AssertionError(f"Function {name} not found")


def _has_livekit_plugin_import(body: list[ast.stmt]) -> bool:
    for stmt in body:
        if isinstance(stmt, ast.ImportFrom) and stmt.module == "livekit.plugins":
            return True
    return False


class LiveKitPluginImportTests(unittest.TestCase):
    def test_pipeline_builders_do_not_import_plugins_inside_functions(self) -> None:
        tree = _parse("pipelines/pipeline_config.py")

        self.assertFalse(_has_livekit_plugin_import(_function(tree, "build_english_pipeline").body))
        self.assertFalse(_has_livekit_plugin_import(_function(tree, "build_urdu_pipeline").body))

    def test_azure_tts_factory_does_not_import_plugin_inside_function(self) -> None:
        tree = _parse("pipelines/azure_tts.py")

        self.assertFalse(_has_livekit_plugin_import(_function(tree, "create_azure_tts").body))


if __name__ == "__main__":
    unittest.main()