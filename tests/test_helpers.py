"""Unit tests for src/helpers.py (run with: npm run test:py)."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import helpers  # noqa: E402

COUNTDOWN_BUG = """def countdown(n):
    print(n)
    countdown(n - 1)

countdown(3)
"""

COUNTDOWN_FIXED = """def countdown(n):
    if n == 0:
        return
    print(n)
    countdown(n - 1)

countdown(3)
"""

LOOP_BUG = """count = 1
while count <= 3:
    print(count)
"""


class TraceRunTests(unittest.TestCase):
    def test_fixed_recursion_goes_up_then_down(self):
        r = helpers.trace_run(COUNTDOWN_FIXED)
        self.assertEqual(r["status"], "ok")
        self.assertEqual(r["output"], "3\n2\n1\n")
        depths = [(e["e"], e["depth"]) for e in r["events"] if e["e"] in ("call", "return")]
        self.assertEqual(depths, [("call", 1), ("call", 2), ("call", 3), ("call", 4),
                                  ("return", 4), ("return", 3), ("return", 2), ("return", 1)])

    def test_runaway_recursion_is_caught_at_the_call_line(self):
        r = helpers.trace_run(COUNTDOWN_BUG)
        self.assertEqual(r["status"], "error")
        self.assertEqual(r["error"]["type"], "RecursionError")
        self.assertEqual(r["error"]["line"], 3)
        self.assertGreater(r["maxDepth"], 100)

    def test_call_events_record_arguments(self):
        r = helpers.trace_run(COUNTDOWN_FIXED)
        args = [e["args"] for e in r["events"] if e["e"] == "call"]
        self.assertEqual(args, ["n=3", "n=2", "n=1", "n=0"])

    def test_infinite_loop_hits_the_step_budget(self):
        r = helpers.trace_run(LOOP_BUG, max_events=500)
        self.assertEqual(r["status"], "budget")
        self.assertEqual(len(r["events"]), 500)
        snaps = r["loopSnapshots"]["2"]
        self.assertTrue(all(s == {"count": "1"} for s in snaps))

    def test_loop_iterations_are_marked(self):
        r = helpers.trace_run("for i in range(4):\n    x = i\n")
        ticks = [e for e in r["events"] if e.get("loop") == 1]
        self.assertEqual(len(ticks), 4)

    def test_except_exception_cannot_hide_the_budget(self):
        code = "while True:\n    try:\n        pass\n    except Exception:\n        pass\n"
        self.assertEqual(helpers.trace_run(code, max_events=300)["status"], "budget")

    def test_name_error_suggests_the_closest_name(self):
        r = helpers.trace_run("total = 0\ntotal = totl + 1\n")
        self.assertEqual(r["error"]["type"], "NameError")
        self.assertEqual(r["error"]["line"], 2)
        self.assertEqual(r["error"]["suggestion"], "total")

    def test_syntax_error(self):
        r = helpers.trace_run("def f(:\n    pass\n")
        self.assertEqual(r["status"], "syntax")
        self.assertEqual(r["error"]["line"], 1)

    def test_input_is_blocked_with_a_friendly_message(self):
        r = helpers.trace_run("x = input()\n")
        self.assertEqual(r["status"], "error")
        self.assertIn("input()", r["error"]["message"])

    def test_state_is_restored_after_a_run(self):
        before = (sys.stdout, sys.getrecursionlimit(), sys.gettrace())
        helpers.trace_run(COUNTDOWN_BUG)
        self.assertEqual(before, (sys.stdout, sys.getrecursionlimit(), sys.gettrace()))

    def test_static_info_about_functions(self):
        r = helpers.trace_run(COUNTDOWN_FIXED)
        info = r["functions"]["countdown"]
        self.assertTrue(info["hasIf"])
        self.assertEqual(info["ifLines"], [2])
        self.assertEqual(info["recursiveCallLines"], [5])


class ParseTreeTests(unittest.TestCase):
    def test_nesting_and_depth(self):
        t = helpers.parse_tree(COUNTDOWN_FIXED)["tree"]
        fn = t["children"][0]
        self.assertEqual((fn["kind"], fn["label"], fn["depth"]), ("function", "countdown(n)", 0))
        self.assertEqual([c["kind"] for c in fn["children"]], ["if", "print", "call"])
        self.assertEqual(fn["children"][0]["children"][0]["kind"], "return")

    def test_if_elif_else_are_siblings(self):
        code = "if a:\n    x = 1\nelif b:\n    x = 2\nelse:\n    x = 3\n"
        kids = helpers.parse_tree(code)["tree"]["children"]
        self.assertEqual([(k["kind"], k["line"], k["endLine"]) for k in kids],
                         [("if", 1, 2), ("elif", 3, 4), ("else", 5, 6)])

    def test_syntax_error(self):
        r = helpers.parse_tree("for x in\n")
        self.assertFalse(r["ok"])
        self.assertEqual(r["error"]["line"], 1)

    def test_long_labels_are_shortened(self):
        code = "x = " + " + ".join(["value"] * 40) + "\n"
        label = helpers.parse_tree(code)["tree"]["children"][0]["label"]
        self.assertLessEqual(len(label), helpers.LABEL_MAX)
        self.assertTrue(label.endswith("…"))


if __name__ == "__main__":
    unittest.main()
