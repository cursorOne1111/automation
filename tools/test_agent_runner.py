import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
import contextlib
import io
import json
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("runner", Path(__file__).with_name("agent_runner.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class AgentRunnerTests(unittest.TestCase):
    def test_prepare_does_not_call_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "web-api-agent-tests").mkdir()
            with patch.object(runner, "ROOT", root), patch.object(runner, "run_process") as process:
                with contextlib.redirect_stdout(io.StringIO()):
                    code = runner.main(["--project", "web", "--role", "plan", "--task", "测试计划"])
            self.assertEqual(code, 0)
            process.assert_not_called()
            manifest = json.loads(next(root.rglob("manifest.json")).read_text())
            self.assertFalse(manifest["executed"])
            self.assertEqual(manifest["status"], "prepared")

    def test_failed_verification_cannot_be_reported_as_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            project = root / "web-api-agent-tests"; project.mkdir()
            (project / "plan.md").write_text("测试计划")
            with patch.object(runner, "ROOT", root), patch.object(runner, "run_process", side_effect=[0, 7]) as process:
                with contextlib.redirect_stdout(io.StringIO()):
                    code = runner.main(["--project", "web", "--role", "generate", "--plan", "plan.md",
                                        "--task", "生成", "--execute"])
            self.assertEqual(code, 7)
            self.assertEqual(process.call_count, 2)
            manifest = json.loads(next(root.rglob("manifest.json")).read_text())
            self.assertEqual(manifest["status"], "verification_failed")
            self.assertEqual(manifest["agent_exit_code"], 0)
            self.assertEqual(manifest["verification"][0]["exit_code"], 7)

    def test_scope_rejects_escape_and_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text("secret")
            for value in ["../outside.md", ".env"]:
                with self.assertRaises(ValueError):
                    runner.scoped_file(root, value)

    def test_scope_rejects_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "project"; root.mkdir()
            outside = Path(directory) / "evidence.md"; outside.write_text("outside")
            (root / "linked.md").symlink_to(outside)
            with self.assertRaises(ValueError):
                runner.scoped_file(root, "linked.md")

    def test_process_preserves_nonzero_and_logs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            code = runner.run_process([sys.executable, "-c", "import sys; print('failure'); sys.exit(7)"],
                                      root, 5, root / "out", root / "err")
            self.assertEqual(code, 7)
            self.assertIn("failure", (root / "out").read_text())

    def test_timeout_is_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            code = runner.run_process([sys.executable, "-c", "import time; time.sleep(10)"],
                                      root, 0.1, root / "out", root / "err")
            self.assertEqual(code, 124)

    def test_prompt_is_sent_over_stdin(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            code = runner.run_process([sys.executable, "-c", "import sys; print(sys.stdin.read())"],
                                      root, 5, root / "out", root / "err", "任务内容")
            self.assertEqual(code, 0)
            self.assertIn("任务内容", (root / "out").read_text())


if __name__ == "__main__":
    unittest.main()
