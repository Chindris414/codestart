// @vitest-environment node
//
// These tests run the real Python harness in real Pyodide (loaded in Node from
// node_modules), so they check actual Python behaviour, not a stand-in.

import { join } from "node:path";

import { loadPyodide, type PyodideAPI } from "pyodide";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import { SIGINT } from "./protocol";
import { createRunnerCore, INPUT_UNAVAILABLE_MESSAGE, OutputBatcher, type RunnerHooks, type Stream } from "./runnerCore";

let pyodide: PyodideAPI;
const interrupt = new Int32Array(new SharedArrayBuffer(4));

beforeAll(async () => {
  pyodide = await loadPyodide({ indexURL: join(process.cwd(), "node_modules", "pyodide") + "/" });
  pyodide.setInterruptBuffer(interrupt);
}, 60_000);

type Chunk = { stream: Stream; text: string };

function setup(overrides: Partial<RunnerHooks> = {}) {
  const chunks: Chunk[] = [];
  const state = { stop: false, truncated: 0 };
  const core = createRunnerCore(pyodide, {
    emit: (stream, text) => chunks.push({ stream, text }),
    onTruncated: () => state.truncated++,
    readInput: () => null,
    stopRequested: () => state.stop,
    ...overrides,
  });
  const text = (stream?: Stream) =>
    chunks.filter((c) => !stream || c.stream === stream).map((c) => c.text).join("");
  return { core, chunks, state, text };
}

beforeEach(() => {
  interrupt[0] = 0;
});

describe("output", () => {
  test("print() goes to stdout, exactly as written", () => {
    const { core, text } = setup();
    expect(core.run("print('Hello, world!')\nprint('a', end='')\nprint('b', 2, sep='-')")).toEqual({
      kind: "success",
    });
    expect(text("stdout")).toBe("Hello, world!\nab-2\n");
    expect(text("stderr")).toBe("");
  });

  test("stdout and stderr keep their order", () => {
    const { core, chunks } = setup();
    core.run("import sys\nprint('one')\nsys.stderr.write('two\\n')\nprint('three')");
    expect(chunks.map((c) => [c.stream, c.text])).toEqual([
      ["stdout", "one\n"],
      ["stderr", "two\n"],
      ["stdout", "three\n"],
    ]);
  });

  test("unicode output survives byte boundaries", () => {
    const { core, text } = setup();
    core.run("print('Ă ș ț 🐍 你好')");
    expect(text()).toBe("Ă ș ț 🐍 你好\n");
  });

  test("Windows line endings in the code are fine", () => {
    const { core, text } = setup();
    expect(core.run("x = 1\r\nprint(x)\r\n")).toEqual({ kind: "success" });
    expect(text()).toBe("1\n");
  });

  test("runaway output is cut off at the limit, reported once", () => {
    const { core, text, state } = setup({ outputLimit: 1000 });
    const outcome = core.run("for i in range(10_000):\n    print(i)");
    expect(outcome).toEqual({ kind: "success" });
    expect(text().length).toBe(1000);
    expect(state.truncated).toBe(1);
  });
});

describe("errors and tracebacks", () => {
  test("a runtime error shows a traceback of the learner's code only, with the line", () => {
    const { core, text } = setup();
    const outcome = core.run("print('before')\nx = 1\ny = x + nmae");
    expect(outcome).toEqual({
      kind: "error",
      name: "NameError",
      line: 3,
      message: "name 'nmae' is not defined",
      source: "y = x + nmae",
    });
    expect(text("stdout")).toBe("before\n");
    const traceback = text("stderr");
    expect(traceback).toContain('File "main.py", line 3, in <module>');
    expect(traceback).toContain("y = x + nmae"); // the source line itself
    expect(traceback).toContain("NameError: name 'nmae' is not defined");
    expect(traceback).not.toMatch(/_codestart|exec\(|<exec>|pyodide/);
  });

  test("the error line points into the learner's function, not the harness", () => {
    const { core, text } = setup();
    const outcome = core.run("def half(n):\n    return n / 0\n\nprint(half(4))");
    expect(outcome).toEqual({
      kind: "error",
      name: "ZeroDivisionError",
      line: 2,
      message: "division by zero",
      source: "    return n / 0",
    });
    expect(text("stderr")).toMatch(/line 4, in <module>[\s\S]*line 2, in half/);
  });

  test("a syntax error is reported with its line and a caret", () => {
    const { core, text } = setup();
    const outcome = core.run("print('ok')\nprint('unterminated");
    expect(outcome).toEqual({
      kind: "error",
      name: "SyntaxError",
      line: 2,
      message: "unterminated string literal (detected at line 2)",
      source: "print('unterminated",
    });
    expect(text("stdout")).toBe(""); // nothing ran
    expect(text("stderr")).toMatch(/File "main.py", line 2\n.*print\('unterminated\n\s+\^/);
  });

  test("an indentation error counts as a syntax error with its line", () => {
    const { core } = setup();
    expect(core.run("if True:\nprint('x')")).toMatchObject({ kind: "error", name: "IndentationError", line: 2 });
  });

  test("sys.exit() and sys.exit(0) are a normal finish; other codes are errors", () => {
    const { core, text } = setup();
    expect(core.run("import sys\nprint('bye')\nsys.exit()")).toEqual({ kind: "success" });
    expect(core.run("import sys\nsys.exit(0)")).toEqual({ kind: "success" });
    expect(core.run("import sys\nsys.exit(3)")).toEqual({
      kind: "error",
      name: "SystemExit",
      line: null,
      message: "",
      source: null,
    });
    expect(core.run("import sys\nsys.exit('Goodbye!')")).toMatchObject({ kind: "error", name: "SystemExit" });
    expect(text("stderr")).toBe("SystemExit: 3\nGoodbye!\n");
  });

  test("each run starts with a fresh namespace", () => {
    const { core, text } = setup();
    core.run("secret = 42");
    expect(core.run("print(secret)")).toMatchObject({ kind: "error", name: "NameError" });
    expect(text("stderr")).toContain("name 'secret' is not defined");
  });
});

describe("input()", () => {
  test("shows the prompt, waits for the answer, and continues", () => {
    const answers = ["Ada", "36"];
    const asked: string[] = [];
    const { core, text } = setup({
      readInput: () => {
        asked.push(text()); // everything printed so far, at the moment of asking
        return answers.shift() ?? null;
      },
    });
    const outcome = core.run(
      "name = input('Name? ')\nage = int(input('Age? '))\nprint(f'{name} is {age + 1} next year')",
    );
    expect(outcome).toEqual({ kind: "success" });
    expect(asked).toEqual(["Name? ", "Name? Age? "]); // prompt flushed before waiting
    expect(text()).toBe("Name? Age? Ada is 37 next year\n");
  });

  test("sys.stdin.readline() works too", () => {
    const { core, text } = setup({ readInput: () => "hello" });
    core.run("import sys\nline = sys.stdin.readline()\nprint(repr(line))");
    expect(text()).toBe("'hello\\n'\n");
  });

  test("a learner's bad input becomes a normal Python error", () => {
    const { core, text } = setup({ readInput: () => "ten" });
    expect(core.run("n = int(input('Number: '))")).toMatchObject({ kind: "error", name: "ValueError", line: 1 });
    expect(text("stderr")).toContain("invalid literal for int() with base 10: 'ten'");
  });

  test("without input support, input() raises a clear explanation", () => {
    const { core, text } = setup({ readInput: null });
    expect(core.run("input('Name? ')")).toMatchObject({ kind: "error", name: "RuntimeError", line: 1 });
    expect(text("stderr")).toContain(INPUT_UNAVAILABLE_MESSAGE);
    expect(text("stderr")).not.toContain("<exec>");
    // The next run with support restored is unaffected.
    const restored = setup({ readInput: () => "x" });
    expect(restored.core.run("print(input())")).toEqual({ kind: "success" });
  });
});

describe("stopping", () => {
  test("an infinite loop ends with the interrupt buffer, reported as stopped without a traceback", () => {
    const { core, text, state } = setup();
    state.stop = true;
    interrupt[0] = SIGINT;
    expect(core.run("while True:\n    pass")).toEqual({ kind: "stopped" });
    expect(text("stderr")).toBe("");
  });

  test("stopping while the program prints", () => {
    let count = 0;
    const box = { stop: false };
    const { core } = setup({
      emit: () => {
        if (++count === 3) {
          box.stop = true;
          interrupt[0] = SIGINT;
        }
      },
      stopRequested: () => box.stop,
    });
    expect(core.run("i = 0\nwhile True:\n    i += 1\n    print(i)")).toEqual({ kind: "stopped" });
  });

  test("stopping while waiting for input", () => {
    const box = { stop: false };
    const { core, text } = setup({
      readInput: () => {
        box.stop = true; // the page cancels the input when Stop is pressed
        return null;
      },
      stopRequested: () => box.stop,
    });
    expect(core.run("input('Name? ')\nprint('never')")).toEqual({ kind: "stopped" });
    expect(text()).toBe("Name? ");
  });

  test("a KeyboardInterrupt the learner raises is an ordinary error", () => {
    const { core } = setup();
    expect(core.run("raise KeyboardInterrupt")).toMatchObject({ kind: "error", name: "KeyboardInterrupt" });
  });
});

describe("OutputBatcher", () => {
  test("sends at most every 50 ms and on stream change", () => {
    const sent: string[] = [];
    let time = 0;
    const batcher = new OutputBatcher({ emit: (s, t) => sent.push(`${s}:${t}`), onTruncated: () => {} }, () => time, 1000);
    batcher.write("stdout", "a");
    batcher.write("stdout", "b");
    expect(sent).toEqual([]);
    time = 60;
    batcher.write("stdout", "c");
    expect(sent).toEqual(["stdout:abc"]);
    batcher.write("stdout", "d");
    batcher.write("stderr", "e");
    expect(sent).toEqual(["stdout:abc", "stdout:d"]);
    batcher.flush();
    expect(sent).toEqual(["stdout:abc", "stdout:d", "stderr:e"]);
  });
});
