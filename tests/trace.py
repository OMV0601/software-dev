"""Test helper: run src/helpers.trace_run on code from stdin and print JSON."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import helpers  # noqa: E402

mode = sys.argv[1] if len(sys.argv) > 1 else "run"
code = sys.stdin.read()
result = helpers.parse_tree(code) if mode == "parse" else helpers.trace_run(code)
print(json.dumps(result))
