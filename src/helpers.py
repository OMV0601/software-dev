# EchoCode - the Python side
#
# This file runs inside the browser using Pyodide (Python turned into WebAssembly).
# The tests in tests/test_helpers.py also run it with normal Python.
#
# There are 2 main functions that JavaScript calls:
#   parse_tree(code)  -> breaks the code into blocks (functions, loops, ifs...)
#   trace_run(code)   -> runs the code and writes down every step it takes
#
# Both give back normal dictionaries, which get turned into JavaScript objects.

import ast
import builtins
import difflib
import io
import keyword
import sys
from contextlib import redirect_stdout

STUDENT_FILE = "<student>"  # fake file name so we can tell the student's code apart
MAX_STEPS = 300000          # if the code takes more steps than this, we say it's stuck
MAX_EVENTS = 4000           # we only SAVE the first 4000 steps (that's plenty for the sounds)
MAX_LABEL_LENGTH = 70
MAX_VALUE_LENGTH = 40
MAX_SNAPSHOTS = 400


# ---------------- small helper functions ----------------

def shorten(text, limit=MAX_LABEL_LENGTH):
    # squash extra spaces/newlines, then cut it off with "…" if it's too long
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[:limit - 1] + "…"


def value_to_text(value):
    # repr() turns a value into text, like 3 -> "3" or "hi" -> "'hi'"
    try:
        return shorten(repr(value), MAX_VALUE_LENGTH)
    except Exception:
        return "<?>"


def code_text(node):
    # turns a piece of the tree back into code text
    try:
        return ast.unparse(node)
    except Exception:
        return ""


def syntax_error_info(err):
    return {
        # IndentationError and TabError are kinds of SyntaxError, keep the real name
        "type": type(err).__name__,
        "message": err.msg or "invalid syntax",
        "line": err.lineno or 1,
        "col": err.offset or 0,
    }


# ---------------- PART 1: parse_tree ----------------
# This turns the code into a tree of blocks, for Explore mode.
# Example: a function is a block, and the lines inside it are its "children".

def kind_and_label(node):
    # kind = what type of block it is (decides the sound)
    # label = short text for the voice to read
    if isinstance(node, ast.FunctionDef):
        arg_names = []
        for a in node.args.args:
            arg_names.append(a.arg)
        return "function", node.name + "(" + ", ".join(arg_names) + ")"
    if isinstance(node, ast.ClassDef):
        return "class", node.name
    if isinstance(node, ast.If):
        return "if", "if " + code_text(node.test)
    if isinstance(node, ast.For):
        return "for", "for " + code_text(node.target) + " in " + code_text(node.iter)
    if isinstance(node, ast.While):
        return "while", "while " + code_text(node.test)
    if isinstance(node, ast.Return):
        if node.value:
            return "return", "return " + code_text(node.value)
        return "return", "return"
    if isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
        return "assign", code_text(node)
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
        func = node.value.func
        if isinstance(func, ast.Name) and func.id == "print":
            return "print", code_text(node.value)
        return "call", code_text(node.value)
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        return "import", code_text(node)
    if isinstance(node, ast.Try):
        return "try", "try"
    if isinstance(node, ast.With):
        return "with", code_text(node).split(":")[0]
    if isinstance(node, ast.Break):
        return "break", "break"
    if isinstance(node, ast.Continue):
        return "continue", "continue"
    if isinstance(node, ast.Pass):
        return "pass", "pass"
    return "statement", code_text(node)


def make_block(kind, label, line, end_line, depth, children):
    return {
        "kind": kind,
        "label": shorten(label),
        "line": line,
        "endLine": end_line,
        "depth": depth,
        "children": children,
    }


def blocks_for(statements, depth):
    # turns a list of statements into a list of blocks
    blocks = []
    for statement in statements:
        if isinstance(statement, ast.If):
            # if/elif/else gives back more than one block, so use extend
            blocks.extend(if_chain_blocks(statement, depth))
        else:
            blocks.append(node_to_block(statement, depth))
    return blocks


def if_chain_blocks(node, depth):
    # Python secretly stores "elif" as an if INSIDE the else part.
    # But when you listen, if / elif / else should be side by side (same level),
    # because that's how the code looks. So we flatten them here.
    blocks = [branch_block(node, "if", depth)]
    while node.orelse:
        first = node.orelse[0]
        # an elif starts in the same column as its if.
        # "else:" followed by an indented if is NOT an elif, so it stays nested.
        is_elif = (len(node.orelse) == 1 and isinstance(first, ast.If)
                   and first.col_offset == node.col_offset)
        if is_elif:
            blocks.append(branch_block(first, "elif", depth))
            node = first
        else:
            else_line = find_keyword_line("else", blocks[-1]["endLine"] + 1, first.lineno)
            end_line = node.orelse[-1].end_lineno or first.lineno
            blocks.append(make_block("else", "else", else_line, end_line, depth,
                                     blocks_for(node.orelse, depth + 1)))
            break
    return blocks


def branch_block(node, kind, depth):
    # one if or elif branch. It ends at the end of its OWN lines.
    label = kind + " " + code_text(node.test)
    end_line = node.body[-1].end_lineno or node.lineno
    return make_block(kind, label, node.lineno, end_line, depth,
                      blocks_for(node.body, depth + 1))


# The tree doesn't remember which line "else:" is on, so we keep the
# source lines around and search for it.
source_lines = []


def find_keyword_line(keyword, start, stop):
    for line_number in range(start, stop + 1):
        if 1 <= line_number <= len(source_lines):
            if source_lines[line_number - 1].strip().startswith(keyword):
                return line_number
    return max(start, 1)


def node_to_block(node, depth):
    kind, label = kind_and_label(node)
    line = node.lineno
    end_line = node.end_lineno or line
    children = []

    if isinstance(node, ast.Try):
        children = blocks_for(node.body, depth + 1)
        for handler in node.handlers:
            if handler.type:
                except_label = "except " + code_text(handler.type)
            else:
                except_label = "except"
            children.append(make_block("except", except_label, handler.lineno,
                                       handler.end_lineno, depth + 1,
                                       blocks_for(handler.body, depth + 2)))
        if node.finalbody:
            finally_line = find_keyword_line("finally", children[-1]["endLine"] + 1,
                                             node.finalbody[0].lineno)
            children.append(make_block("finally", "finally", finally_line,
                                       node.finalbody[-1].end_lineno, depth + 1,
                                       blocks_for(node.finalbody, depth + 2)))
    elif hasattr(node, "body") and isinstance(node.body, list):
        # functions, loops, classes, with... all keep their lines in .body
        children = blocks_for(node.body, depth + 1)

    return make_block(kind, label, line, end_line, depth, children)


def parse_tree(code):
    try:
        tree = ast.parse(code, filename=STUDENT_FILE)
    except SyntaxError as err:
        return {"ok": False, "error": syntax_error_info(err)}

    source_lines.clear()
    source_lines.extend(code.splitlines())
    total_lines = code.count("\n") + 1
    root = make_block("module", "program", 1, total_lines, -1, blocks_for(tree.body, 0))
    return {"ok": True, "tree": root}


# ---------------- PART 2: facts about the code before it runs ----------------

def find_loops_and_functions(tree):
    loops = []              # every for/while loop
    functions = {}          # function name -> facts about it
    loop_body_starts = {}   # first line inside a loop -> the loop's line

    for node in ast.walk(tree):  # ast.walk visits every piece of the tree
        if isinstance(node, (ast.For, ast.While)):
            condition_vars = []
            if isinstance(node, ast.While):
                # remember the variables in the while condition, e.g. "count <= 3" -> count
                for part in ast.walk(node.test):
                    if isinstance(part, ast.Name) and part.id not in condition_vars:
                        condition_vars.append(part.id)
                condition_vars.sort()
                kind = "while"
                test = code_text(node.test)
            else:
                kind = "for"
                test = code_text(node.iter)
            loops.append({
                "line": node.lineno,
                "kind": kind,
                "test": shorten(test),
                "condVars": condition_vars,
            })
            loop_body_starts[node.body[0].lineno] = node.lineno

        elif isinstance(node, ast.FunctionDef):
            if_lines = []
            has_return = False
            recursive_call_lines = []
            for part in ast.walk(node):
                if isinstance(part, ast.If):
                    if_lines.append(part.lineno)
                if isinstance(part, ast.Return):
                    has_return = True
                # does the function call itself? (that's recursion)
                if (isinstance(part, ast.Call) and isinstance(part.func, ast.Name)
                        and part.func.id == node.name
                        and part.lineno not in recursive_call_lines):
                    recursive_call_lines.append(part.lineno)
            recursive_call_lines.sort()
            functions[node.name] = {
                "line": node.lineno,
                "hasIf": len(if_lines) > 0,
                "ifLines": if_lines,
                "hasReturn": has_return,
                "recursiveCallLines": recursive_call_lines,
            }

    loops.sort(key=lambda loop: loop["line"])
    return loops, functions, loop_body_starts


# ---------------- PART 3: trace_run ----------------
# sys.settrace() lets us give Python a function that gets called on EVERY step:
# every line, every function call and every return. We write each one down.

class TooManySteps(BaseException):
    # We raise this to stop code that runs forever.
    # It's a BaseException (not a normal Exception) so the student's own
    # "except Exception:" can't catch it and keep the infinite loop going.
    pass


# these get reset at the start of every run
events = []
depth = 0
max_depth = 0
steps = 0
max_steps = MAX_STEPS
loop_body_starts = {}
loop_condition_vars = {}
loop_snapshots = {}
# we count these for the WHOLE run, even after we stop saving events,
# so a loop that runs 10,000 times still gets counted right
loop_counts = {}
call_counts = {}
return_counts = {}


def add_one(counts, key):
    if key not in counts:
        counts[key] = 0
    counts[key] += 1


def record(event):
    global steps
    steps += 1
    if steps > max_steps:
        raise TooManySteps()
    if len(events) < MAX_EVENTS:
        events.append(event)


def lookup_value(frame, name):
    # find a variable's value: first inside the function, then the whole program
    if name in frame.f_locals:
        return value_to_text(frame.f_locals[name])
    if name in frame.f_globals:
        return value_to_text(frame.f_globals[name])
    return "undefined"


def watch_step(frame, event, arg):
    # Python calls this on every step. frame = where we are right now.
    global depth, max_depth

    if frame.f_code.co_filename != STUDENT_FILE:
        return None  # not the student's code (library code), ignore it

    name = frame.f_code.co_name  # name of the function we're in

    if event == "call":
        if name == "<module>":  # this is just the program starting
            return watch_step
        depth += 1
        if depth > max_depth:
            max_depth = depth
        add_one(call_counts, name)
        # write down the argument values, like "n=3"
        arg_texts = []
        argument_names = frame.f_code.co_varnames[:frame.f_code.co_argcount]
        for arg_name in argument_names:
            arg_texts.append(arg_name + "=" + value_to_text(frame.f_locals.get(arg_name)))
        record({"e": "call", "line": frame.f_lineno, "depth": depth,
                "fn": name, "args": shorten(", ".join(arg_texts))})

    elif event == "line":
        line = frame.f_lineno
        step = {"e": "line", "line": line, "depth": depth}
        # if this is the first line inside a loop, the loop just went round once
        if line in loop_body_starts:
            loop_line = loop_body_starts[line]
            step["loop"] = loop_line
            add_one(loop_counts, loop_line)
            # for while loops, save the condition variables every round,
            # so later we can say "count was 1 every single time"
            if loop_line in loop_condition_vars:
                if loop_line not in loop_snapshots:
                    loop_snapshots[loop_line] = []
                if len(loop_snapshots[loop_line]) < MAX_SNAPSHOTS:
                    snapshot = {}
                    for var in loop_condition_vars[loop_line]:
                        snapshot[var] = lookup_value(frame, var)
                    loop_snapshots[loop_line].append(snapshot)
        record(step)

    elif event == "return":
        if name == "<module>":
            return watch_step
        record({"e": "return", "line": frame.f_lineno, "depth": depth,
                "fn": name, "value": value_to_text(arg)})
        add_one(return_counts, name)
        depth -= 1

    return watch_step


def error_line(traceback, want_caller=False):
    # go through the traceback and find the lines that are in the student's code
    lines = []
    while traceback is not None:
        if traceback.tb_frame.f_code.co_filename == STUDENT_FILE:
            lines.append(traceback.tb_lineno)
        traceback = traceback.tb_next
    if len(lines) == 0:
        return None
    # for runaway recursion the useful line is where the call was made,
    # which is one step before the last one
    if want_caller and len(lines) >= 2:
        return lines[-2]
    return lines[-1]


def closest_name(wrong_name, tree):
    # for typos like "totl", find the name they probably meant ("total")
    known_names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            known_names.append(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            known_names.append(node.name)
        elif isinstance(node, ast.arg):
            known_names.append(node.arg)
    for builtin_name in dir(builtins):
        if not builtin_name.startswith("_"):
            known_names.append(builtin_name)
    # Python keywords too, so "retur" -> "return" and "whlie" -> "while"
    known_names.extend(keyword.kwlist)
    known_names = sorted(set(known_names))
    if wrong_name in known_names:
        known_names.remove(wrong_name)
    # difflib is built into Python, it finds the most similar word
    matches = difflib.get_close_matches(wrong_name, known_names, n=1, cutoff=0.6)
    if matches:
        return matches[0]
    return None


def no_input(*args, **kwargs):
    raise RuntimeError("input() is not supported in EchoCode yet. "
                       "Put the value straight into a variable instead.")


def trace_run(code, limit=MAX_STEPS):
    global events, depth, max_depth, steps, max_steps
    global loop_body_starts, loop_condition_vars, loop_snapshots
    global loop_counts, call_counts, return_counts

    # 1. check the code is valid Python first
    try:
        tree = ast.parse(code, filename=STUDENT_FILE)
        compiled = compile(tree, STUDENT_FILE, "exec")
    except SyntaxError as err:
        return {"status": "syntax", "error": syntax_error_info(err), "events": [],
                "output": "", "loops": [], "functions": {}, "loopSnapshots": {},
                "loopCounts": {}, "callCounts": {}, "returnCounts": {},
                "maxDepth": 0, "depthAtEnd": 0, "steps": 0, "eventsCut": False}

    # 2. reset everything from the last run
    loops, functions, loop_body_starts = find_loops_and_functions(tree)
    loop_condition_vars = {}
    for loop in loops:
        if loop["condVars"]:
            loop_condition_vars[loop["line"]] = loop["condVars"]
    events = []
    depth = 0
    max_depth = 0
    steps = 0
    max_steps = limit
    loop_snapshots = {}
    loop_counts = {}
    call_counts = {}
    return_counts = {}

    # 3. run it, catching whatever goes wrong
    printed = io.StringIO()  # print() will write into this instead of the screen
    status = "ok"
    error = None
    old_input = builtins.input
    old_limit = sys.getrecursionlimit()
    builtins.input = no_input
    # same recursion limit as normal Python, so code acts the same as it would anywhere else
    sys.setrecursionlimit(1000)
    try:
        with redirect_stdout(printed):
            sys.settrace(watch_step)
            exec(compiled, {"__name__": "__main__", "__builtins__": builtins})
    except TooManySteps:
        status = "budget"
    except RecursionError as err:
        status = "error"
        error = {"type": "RecursionError", "message": str(err),
                 "line": error_line(err.__traceback__, want_caller=True)}
    except BaseException as err:
        status = "error"
        error = {"type": type(err).__name__, "message": shorten(str(err), 160),
                 "line": error_line(err.__traceback__)}
        if isinstance(err, NameError) and err.name:
            error["name"] = err.name
            suggestion = closest_name(err.name, tree)
            if suggestion:
                error["suggestion"] = suggestion
    finally:
        # ALWAYS put things back to normal, even if something crashed
        sys.settrace(None)
        builtins.input = old_input
        sys.setrecursionlimit(old_limit)

    # JSON keys have to be text, so turn the loop line numbers into strings
    snapshots = {}
    for loop_line in loop_snapshots:
        snapshots[str(loop_line)] = loop_snapshots[loop_line]
    counts = {}
    for loop_line in loop_counts:
        counts[str(loop_line)] = loop_counts[loop_line]

    return {
        "status": status,
        "error": error,
        "events": events,
        "output": printed.getvalue(),
        "loops": loops,
        "functions": functions,
        "loopSnapshots": snapshots,
        "loopCounts": counts,
        "callCounts": call_counts,
        "returnCounts": return_counts,
        "maxDepth": max_depth,
        "depthAtEnd": depth,
        "steps": steps,
        "eventsCut": steps > len(events),
    }
