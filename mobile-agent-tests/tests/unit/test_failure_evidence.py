"""用受控失败验证 pytest 报告钩子，不连接设备。"""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from framework.settings import ROOT

PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='


def test_controlled_failure_collects_evidence():
    artifacts = ROOT / 'artifacts'
    artifacts.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='report-check-', dir=artifacts) as directory:
        directory = Path(directory)
        test_file = directory / 'test_controlled.py'
        source = '<hierarchy><node text="demo"/></hierarchy>'
        test_file.write_text(
            'import base64\nimport pytest\n'
            'class Driver:\n'
            f'    def get_screenshot_as_png(self): return base64.b64decode({PNG!r})\n'
            f'    page_source = {source!r}\n'
            '@pytest.fixture\ndef driver(): return Driver()\n'
            'def test_controlled(driver): assert False, "expected evidence probe"\n',
            encoding='utf-8',
        )
        report = directory / 'report.html'
        result = subprocess.run(
            [sys.executable, '-m', 'pytest', str(test_file), '--html=' + str(report), '--self-contained-html', '-q'],
            cwd=ROOT, env={**os.environ, 'CAPTURES_PAGE_SOURCE': '1'},
            capture_output=True, text=True, timeout=30,
        )
        assert result.returncode == 1, result.stdout + result.stderr
        assert '1 failed' in result.stdout, result.stdout
        nodeid = test_file.relative_to(ROOT).as_posix() + '::test_controlled'
        evidence = artifacts / hashlib.sha256(nodeid.encode()).hexdigest()[:16]
        assert json.loads((evidence / 'failure.json').read_text())['phase'] == 'call'
        assert (evidence / 'failure.png').read_bytes() == base64.b64decode(PNG)
        assert '<hierarchy>' in (evidence / 'source.xml').read_text()
        assert PNG in report.read_text(encoding='utf-8')
