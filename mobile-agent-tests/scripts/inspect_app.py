"""采集真实设备截图和页面树，供 Agent 核实定位；会创建并关闭独立会话。"""
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv
from framework.driver import create_driver
from framework.settings import Settings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", action="store_true", help="同时输出可能含业务数据的 XML")
    args = parser.parse_args()
    load_dotenv(ROOT / ".env")
    output = ROOT / "artifacts" / "inspection"
    output.mkdir(parents=True, exist_ok=True)
    driver = create_driver(Settings.from_env())
    try:
        driver.save_screenshot(str(output / "screen.png"))
        if args.source:
            (output / "source.xml").write_text(driver.page_source, encoding="utf-8")
        print(output)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
