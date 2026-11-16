"""EchoCode Python helpers.

Runs inside Pyodide (Python compiled to WebAssembly) in a Web Worker, and also
under normal CPython for the unit tests in tests/test_helpers.py.

Two public functions, both return plain dicts that are sent to JavaScript as JSON:

    parse_tree(code)  -> the code's structure (functions, loops, ifs...) as a tree
    trace_run(code)   -> runs the code and records every step it takes

Nothing in here decides anything with AI. It is all ordinary, deterministic code.
"""

import ast
import builtins
import difflib
import sys

STUDENT_FILE = "<student>"
DEFAULT_MAX_EVENTS = 4000
LABEL_MAX = 70
REPR_MAX = 40
MAX_LOOP_SNAPSHOTS = 400


# --------------------------------------------------------------------------- #
# Small utilities
# --------------------------------------------------------------------------- #

def _short(text, limit=LABEL_MAX):
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _safe_repr(value, limit=REPR_MAX):
    try:
        text = repr(value)
    except Exception:  # a student's __repr__ could raise
        text = "<?>"
    return _short(text, limit)


def _unparse(node):
    try:
        return ast.unparse(node)
    except Exception:
        return ""


def _syntax_error(err):
    return {
        "type": "SyntaxError",
        "message": err.msg or "invalid syntax",
        "line": err.lineno or 1,
        "col": err.offset or 0,
    }


# --------------------------------------------------------------------------- #
# parse_tree: code -> tree of blocks
# --------------------------------------------------------------------------- #

def _kind_and_label(node):
    """A friendly kind (used for the sound) and a short label (used for speech)."""
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        args = ", ".join(a.arg for a in node.args.args)
        return "function", f"{node.name}({args})"
    if isinstance(node, ast.ClassDef):
        return "class", node.name
    if isinstance(node, ast.If):
        return "if", f"if {_unparse(node.test)}"
    if isinstance(node, ast.For):
        return "for", f"for {_unparse(node.target)} in {_unparse(node.iter)}"
    if isinstance(node, ast.While):
        return "while", f"while {_unparse(node.test)}"
    if isinstance(node, ast.Return):
        return "return", f"return {_unparse(node.value)}" if node.value else "return"
    if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
        return "assign", _unparse(node)
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
        func = node.value.func
        if isinstance(func, ast.Name) and func.id == "print":
            return "print", _unparse(node.value)
        return "call", _unparse(node.value)
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        return "import", _unparse(node)
    if isinstance(node, ast.Try):
        return "try", "try"
    if isinstance(node, (ast.With, ast.AsyncWith)):
        return "with", _unparse(node).split(":")[0]
    if isinstance(node, ast.Break):
        return "break", "break"
    if isinstance(node, ast.Continue):
        return "continue", "continue"
    if isinstance(node, ast.Pass):
        return "pass", "pass"
    return "statement", _unparse(node)


def _block(kind, label, line, end_line, depth, children):
    return {
        "kind": kind,
        "label": _short(label),
        "line": line,
        "endLine": end_line,
        "depth": depth,
        "children": children,
    }


def _statements(stmts, depth):
    out = []
    for s in stmts:
        if isinstance(s, ast.If):
            out.extend(_if_chain(s, depth))
        else:
            out.append(_node(s, depth))
    return out


def _if_chain(node, depth):
    """if / elif / elif / else as siblings at the same level, like they look.

    Python stores `elif` as an If nested inside the else branch; a listener
    should hear them side by side instead.
    """
    blocks = [_branch_block(node, "if", depth)]
    while node.orelse:
        first = node.orelse[0]
        # `elif` starts in the same column as its `if`; `else:` + a nested
        # `if` is indented further, and stays nested.
        if (len(node.orelse) == 1 and isinstance(first, ast.If)
                and first.col_offset == node.col_offset):
            blocks.append(_branch_block(first, "elif", depth))
            node = first
            continue
        else_line = _find_keyword_line("else", blocks[-1]["endLine"] + 1, first.lineno)
        blocks.append(_block("else", "else", else_line,
                             node.orelse[-1].end_lineno or first.lineno, depth,
                             _statements(node.orelse, depth + 1)))
        break
    return blocks


def _branch_block(node, kind, depth):
    """One if/elif branch. Ends at its own body, not at the end of the chain."""
    label = ("if " if kind == "if" else "elif ") + _unparse(node.test)
    return _block(kind, label, node.lineno, node.body[-1].end_lineno or node.lineno,
                  depth, _statements(node.body, depth + 1))


# Source lines of the program being parsed (used to find `else:` lines,
# which Python's ast does not record).
_SOURCE_LINES = []


def _find_keyword_line(keyword, start, stop):
    for n in range(start, stop + 1):
        if 1 <= n <= len(_SOURCE_LINES) and _SOURCE_LINES[n - 1].strip().startswith(keyword):
            return n
    return max(start, 1)


def _node(node, depth):
    kind, label = _kind_and_label(node)
    line = getattr(node, "lineno", 1)
    end_line = getattr(node, "end_lineno", line) or line
    children = []

    if isinstance(node, ast.Try):
        children = _statements(node.body, depth + 1)
        for handler in node.handlers:
            exc_label = "except " + _unparse(handler.type) if handler.type else "except"
            children.append(
                _block("except", exc_label, handler.lineno, handler.end_lineno,
                       depth + 1, _statements(handler.body, depth + 2))
            )
        if node.finalbody:
            children.append(
                _block("finally", "finally",
                       _find_keyword_line("finally", children[-1]["endLine"] + 1,
                                          node.finalbody[0].lineno),
                       node.finalbody[-1].end_lineno, depth + 1,
                       _statements(node.finalbody, depth + 2))
            )
    elif hasattr(node, "body") and isinstance(node.body, list):
        children = _statements(node.body, depth + 1)

    return _block(kind, label, line, end_line, depth, children)


def parse_tree(code):
    """Return {"ok": True, "tree": {...}} or {"ok": False, "error": {...}}."""
    try:
        module = ast.parse(code, filename=STUDENT_FILE)
    except SyntaxError as err:
        return {"ok": False, "error": _syntax_error(err)}
    _SOURCE_LINES[:] = code.splitlines()
    lines = code.count("\n") + 1
    root = _block("module", "program", 1, lines, -1, _statements(module.body, 0))
    return {"ok": True, "tree": root}


# --------------------------------------------------------------------------- #
# Static facts used by trace_run and the analyzer
# --------------------------------------------------------------------------- #

def _static_info(module):
    loops = []        # every for/while loop
    functions = {}    # name -> facts about the function
    body_starts = {}  # first line of a loop body -> loop header line

    for node in ast.walk(module):
        if isinstance(node, (ast.For, ast.While)):
            cond_vars = []
            if isinstance(node, ast.While):
                cond_vars = sorted({n.id for n in ast.walk(node.test)
                                    if isinstance(n, ast.Name)})
            loops.append({
                "line": node.lineno,
                "kind": "while" if isinstance(node, ast.While) else "for",
                "test": _short(_unparse(node.test) if isinstance(node, ast.While)
                               else _unparse(node.iter)),
                "condVars": cond_vars,
            })
            body_starts[node.body[0].lineno] = node.lineno
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            inner = list(ast.walk(node))
            ifs = [n for n in inner if isinstance(n, ast.If)]
            functions[node.name] = {
                "line": node.lineno,
                "hasIf": bool(ifs),
                "ifLines": [n.lineno for n in ifs],
                "hasReturn": any(isinstance(n, ast.Return) for n in inner),
                "recursiveCallLines": sorted({
                    n.lineno for n in inner
                    if isinstance(n, ast.Call)
                    and isinstance(n.func, ast.Name)
                    and n.func.id == node.name
                }),
            }
    loops.sort(key=lambda l: l["line"])
    return loops, functions, body_starts


# --------------------------------------------------------------------------- #
# trace_run: run the code and record every step
# --------------------------------------------------------------------------- #

class _Budget(BaseException):
    """Raised by the tracer when the program takes too many steps.

    BaseException (not Exception) so a student's `except Exception:` cannot
    swallow it and keep an infinite loop alive.
    """


class _Recorder:
    def __init__(self, max_events, body_starts, loops):
        self.events = []
        self.output = []
        self.max_events = max_events
        self.body_starts = body_starts
        self.cond_vars = {l["line"]: l["condVars"] for l in loops if l["condVars"]}
        self.loop_snapshots = {}  # loop header line -> list of {var: repr}
        self.depth = 0
        self.max_depth = 0
        self.steps = 0

    # -- events ------------------------------------------------------------ #
    def add(self, event):
        self.steps += 1
        if len(self.events) >= self.max_events:
            raise _Budget()
        self.events.append(event)

    def write(self, text):
        if text:
            self.output.append(text)
            self.add({"e": "out", "text": _short(text, 200), "depth": self.depth})
        return len(text)

    def flush(self):
        pass

    # -- sys.settrace hook --------------------------------------------------- #
    def tracer(self, frame, event, arg):
        if frame.f_code.co_filename != STUDENT_FILE:
            return None  # ignore library code, only trace the student's program
        name = frame.f_code.co_name

        if event == "call":
            if name == "<module>":
                return self.tracer
            self.depth += 1
            self.max_depth = max(self.max_depth, self.depth)
            args = ", ".join(
                f"{k}={_safe_repr(frame.f_locals.get(k))}"
                for k in frame.f_code.co_varnames[: frame.f_code.co_argcount]
            )
            self.add({"e": "call", "line": frame.f_lineno, "depth": self.depth,
                      "fn": name, "args": _short(args)})
            return self.tracer

        if event == "line":
            line = frame.f_lineno
            loop = self.body_starts.get(line)
            ev = {"e": "line", "line": line, "depth": self.depth}
            if loop is not None:
                ev["loop"] = loop
                names = self.cond_vars.get(loop)
                if names:
                    snaps = self.loop_snapshots.setdefault(loop, [])
                    if len(snaps) < MAX_LOOP_SNAPSHOTS:
                        snaps.append({n: self._lookup(frame, n) for n in names})
            self.add(ev)
            return self.tracer

        if event == "return":
            if name == "<module>":
                return self.tracer
            self.add({"e": "return", "line": frame.f_lineno, "depth": self.depth,
                      "fn": name, "value": _safe_repr(arg)})
            self.depth -= 1
            return self.tracer

        return self.tracer

    @staticmethod
    def _lookup(frame, name):
        if name in frame.f_locals:
            return _safe_repr(frame.f_locals[name])
        if name in frame.f_globals:
            return _safe_repr(frame.f_globals[name])
        return "undefined"


def _student_line(tb, caller=False):
    """Line in the student's code where an error happened.

    caller=True returns the line one frame up (where the failing call was
    made), which is the useful line for runaway recursion.
    """
    lines = []
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == STUDENT_FILE:
            lines.append(tb.tb_lineno)
        tb = tb.tb_next
    if not lines:
        return None
    if caller and len(lines) >= 2:
        return lines[-2]
    return lines[-1]


def _closest_name(name, module):
    """For a NameError, the most similar name the student actually defined."""
    known = set()
    for node in ast.walk(module):
        if isinstance(node, ast.Name):
            known.add(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            known.add(node.name)
        elif isinstance(node, ast.arg):
            known.add(node.arg)
    known.discard(name)
    known.update(n for n in dir(builtins) if not n.startswith("_"))
    match = difflib.get_close_matches(name, sorted(known), n=1, cutoff=0.6)
    return match[0] if match else None


def _no_input(*_args, **_kwargs):
    raise RuntimeError("input() is not supported in EchoCode yet. "
                       "Put the value straight into a variable instead.")


def trace_run(code, max_events=DEFAULT_MAX_EVENTS):
    """Run `code` and return everything that happened, step by step.

    status is one of:
      "ok"        finished normally
      "error"     raised an exception (RecursionError included)
      "budget"    took too many steps (likely an infinite loop or recursion)
      "syntax"    could not be parsed
    """
    try:
        module = ast.parse(code, filename=STUDENT_FILE)
        compiled = compile(module, STUDENT_FILE, "exec")
    except SyntaxError as err:
        return {"status": "syntax", "error": _syntax_error(err), "events": [],
                "output": "", "loops": [], "functions": {}, "loopSnapshots": {},
                "maxDepth": 0, "steps": 0}

    loops, functions, body_starts = _static_info(module)
    rec = _Recorder(max_events, body_starts, loops)
    namespace = {"__name__": "__main__", "__builtins__": builtins}
    status, error = "ok", None

    old_stdout, old_input = sys.stdout, builtins.input
    old_limit = sys.getrecursionlimit()
    sys.stdout = rec
    builtins.input = _no_input
    # Keep recursion modest: deep enough for real programs, shallow enough that
    # runaway recursion is caught quickly (and safely inside WebAssembly).
    sys.setrecursionlimit(400)
    sys.settrace(rec.tracer)
    try:
        exec(compiled, namespace)
    except _Budget:
        status = "budget"
    except RecursionError as err:
        status = "error"
        error = {"type": "RecursionError", "message": str(err),
                 "line": _student_line(err.__traceback__, caller=True)}
    except BaseException as err:  # report anything the student's code raises
        status = "error"
        error = {"type": type(err).__name__, "message": _short(str(err), 160),
                 "line": _student_line(err.__traceback__)}
        if isinstance(err, NameError) and getattr(err, "name", None):
            error["name"] = err.name
            suggestion = _closest_name(err.name, module)
            if suggestion:
                error["suggestion"] = suggestion
    finally:
        sys.settrace(None)
        sys.stdout = old_stdout
        builtins.input = old_input
        sys.setrecursionlimit(old_limit)

    return {
        "status": status,
        "error": error,
        "events": rec.events,
        "output": "".join(rec.output),
        "loops": loops,
        "functions": functions,
        "loopSnapshots": {str(k): v for k, v in rec.loop_snapshots.items()},
        "maxDepth": rec.max_depth,
        "steps": rec.steps,
    }
