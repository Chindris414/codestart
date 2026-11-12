// Plain-language explanations of Python errors, shown next to the original
// traceback after a failed Run (see components/editor/ErrorExplanation.tsx).
//
// How an error is matched: RULES is checked from top to bottom and the first
// rule whose `names` contains the error's name, and whose `pattern` (if any)
// matches the message, wins. Specific patterns therefore come before the
// general entry for the same error, and FALLBACK covers everything else.
// The message is the last line of the traceback without the "Name: " prefix,
// e.g. "name 'pritn' is not defined. Did you mean: 'print'?" (Python 3.14
// wording, as used by Pyodide 314).
//
// Writing explanations:
// - Text between backticks is shown as code.
// - {placeholders} are filled from the pattern's groups (named in `groups`),
//   plus {line}
//   (the line number), {message} and {errorName}. A group whose name ends in
//   "Type" (e.g. otherType = "int") also gets a readable {otherTypeLabel}
//   ("a whole number (int)").
// - A tip that uses a placeholder with no value (e.g. {line} when the line
//   is unknown) is left out; titles and summaries should not need {line},
//   since the panel already shows the line and its code.
// - Beginner vocabulary, no blame, and short: a title, one or two sentences,
//   two or three things to check.
//
// The text is not secret and does not depend on the learner, so it ships with
// the page: no backend call, and it works on sample lessons while logged out.
// Each rule has a stable `id` so the Phase 3 tutor can be told which
// explanation the learner has already seen.

export type ErrorDetails = {
  name: string;
  message: string;
  line: number | null;
};

// A piece of explanation text: plain, or shown as code.
export type Segment = { text: string; code: boolean };

export type Explanation = {
  id: string;
  title: Segment[];
  summary: Segment[];
  tips: Segment[][];
};

type Rule = {
  id: string;
  names: string[];
  pattern?: RegExp;
  // Names for the pattern's capturing groups, in order, used as
  // {placeholders}. (Numbered groups rather than (?<name>…): the project
  // targets ES2017.)
  groups?: string[];
  title: string;
  summary: string;
  tips: string[];
};

// Errors that are not mistakes to explain: Stop, and sys.exit().
const NOT_EXPLAINED = new Set(["KeyboardInterrupt", "SystemExit"]);

const TYPE_LABELS: Record<string, string> = {
  int: "a whole number (int)",
  float: "a decimal number (float)",
  str: "text (str)",
  bool: "True or False (bool)",
  list: "a list",
  dict: "a dictionary",
  tuple: "a tuple",
  set: "a set",
  NoneType: 'None, which means "no value"',
  function: "a function",
  builtin_function_or_method: "a function",
};

function typeLabel(typeName: string): string {
  return TYPE_LABELS[typeName] ?? `a value of type ${typeName}`;
}

const SYNTAX = ["SyntaxError"];
const INDENTATION = ["IndentationError", "TabError"];

const RULES: Rule[] = [
  // -- SyntaxError: Python could not read the program, so nothing ran -------
  {
    id: "syntax-curly-quotes",
    names: SYNTAX,
    pattern: /invalid character '([“”‘’])'/,
    groups: ["char"],
    title: "Curly quotes instead of straight ones",
    summary:
      "Python only understands straight quotes, `\"` and `'`. The curly quote `{char}` usually sneaks in when code is copied from a document, a chat app or a web page.",
    tips: [
      "Delete the curly quotes on line {line} and type them again on your keyboard.",
      "Check the rest of the line too: curly quotes usually come in pairs.",
    ],
  },
  {
    id: "syntax-invalid-character",
    names: SYNTAX,
    pattern: /invalid character '(.+?)'/,
    groups: ["char"],
    title: "A character Python doesn't understand",
    summary: "The line contains `{char}`, which isn't allowed in Python code unless it is inside quotes.",
    tips: [
      "Delete the character and retype that part of the line on your keyboard.",
      "If it is meant to be shown on screen, put it inside the quotes, as part of the text.",
    ],
  },
  {
    id: "syntax-unterminated-string",
    names: SYNTAX,
    pattern: /unterminated (?:triple-quoted )?string literal/,
    title: "A piece of text is missing its closing quote",
    summary:
      "Text in Python starts and ends with a quote mark. Python found a quote that opens a piece of text, but not the one that closes it, so it can't tell where the text ends.",
    tips: [
      'Add the missing quote at the end of the text, e.g. `print("Hello")`.',
      "Use the same kind of quote on both sides: `\"...\"` or `'...'`, not one of each.",
      "If the text itself contains an apostrophe, like it's, wrap it in double quotes: `\"it's\"`.",
    ],
  },
  {
    id: "syntax-bracket-never-closed",
    names: SYNTAX,
    pattern: /'([(\[{])' was never closed/,
    groups: ["bracket"],
    title: "A bracket was opened but never closed",
    summary:
      "Every `{bracket}` needs a matching closing bracket. The one on this line is still open when Python reaches the end of your program.",
    tips: [
      "Count the brackets on line {line}: each opening bracket needs a closing one, e.g. `print(\"Hi\")`.",
      "If the closing bracket is there, look for a missing quote before it: text that never ends swallows the bracket too.",
    ],
  },
  {
    id: "syntax-bracket-mismatch",
    names: SYNTAX,
    pattern: /closing parenthesis '(.)' does not match opening parenthesis '(.)'/,
    groups: ["closing", "opening"],
    title: "Brackets that don't match",
    summary:
      "Each kind of bracket has its own partner: `(` with `)`, `[` with `]` and `{` with `}`. Here a `{opening}` is closed with a `{closing}`.",
    tips: ["Change the closing bracket so it matches the opening one."],
  },
  {
    id: "syntax-bracket-unmatched",
    names: SYNTAX,
    pattern: /unmatched '([)\]}])'/,
    groups: ["bracket"],
    title: "There's an extra closing bracket",
    summary: "This line has a `{bracket}` that doesn't close anything: no opening bracket is waiting for it.",
    tips: [
      "Remove the extra `{bracket}`, or add the opening bracket it belongs to.",
      "Count the brackets: every opening one needs exactly one closing one.",
    ],
  },
  {
    id: "syntax-print-without-brackets",
    names: SYNTAX,
    pattern: /Missing parentheses in call to 'print'/,
    title: "`print` needs round brackets",
    summary: "`print` is a function, so whatever you want to show goes inside round brackets after it.",
    tips: [
      'Write `print("Hello")` instead of `print "Hello"`.',
      "Some older books and websites show the old style without brackets; it no longer works.",
    ],
  },
  {
    id: "syntax-missing-comma",
    names: SYNTAX,
    pattern: /Perhaps you forgot a comma\?/,
    title: "Two things side by side with nothing between them",
    summary:
      "Python found two values next to each other with nothing joining them, and thinks a comma might be missing.",
    tips: [
      'To print several things, separate them with commas: `print("Age:", age)`.',
      "If a word is meant to be text, it needs quotes around it.",
      'To join two pieces of text into one, put `+` between them: `"Hello, " + name`.',
    ],
  },
  {
    id: "syntax-assign-instead-of-compare",
    names: SYNTAX,
    pattern: /Maybe you meant '==' /,
    title: "`=` where `==` was meant",
    summary:
      "A single `=` stores a value in a variable. To check whether two things are equal, Python uses a double `==`.",
    tips: [
      "To compare, for example in an `if` line, write `==`: `if age == 18:`.",
      "To store a value, the variable name goes on the left: `age = 18`, not `18 = age`.",
    ],
  },
  {
    id: "syntax-cannot-assign",
    names: SYNTAX,
    pattern: /cannot assign to /,
    title: "The left side of `=` must be a variable name",
    summary: "`=` stores the value on its right in the name on its left. Here the left side isn't a plain name, so Python has nowhere to store the value.",
    tips: [
      "Put a variable name on the left and the value on the right: `total = price * 2`.",
      "`True`, `False` and `None` are reserved by Python and can't be used as variable names.",
    ],
  },
  {
    id: "syntax-invalid-decimal",
    names: SYNTAX,
    pattern: /invalid decimal literal/,
    title: "A number with letters stuck to it",
    summary:
      "Python saw a number that runs straight into letters, like `1st` or `3x`. Variable names may contain digits, but they can't start with one.",
    tips: [
      "Rename the variable so it starts with a letter or `_`, e.g. `first` or `place_1`.",
      "If you meant to multiply, Python needs a `*`: `3 * x`, not `3x`.",
    ],
  },
  {
    id: "syntax-expected-colon",
    names: SYNTAX,
    pattern: /expected ':'/,
    title: "A colon is missing",
    summary: "Lines that start a block, such as `if`, `else`, `for`, `while` and `def`, must end with a colon `:`.",
    tips: [
      "Add `:` at the end of line {line}.",
      "The lines that belong to the block go underneath, indented by 4 spaces.",
    ],
  },
  {
    id: "syntax-general",
    names: SYNTAX,
    title: "Python couldn't read this line",
    summary:
      "Before running anything, Python reads your whole program to check it follows Python's rules. Something on this line, or just before it, doesn't, so none of your program ran.",
    tips: [
      "Look at the `^` marks in the error: they point to where Python got confused.",
      "Check for missing or extra quotes, brackets, commas and colons.",
      "If line {line} looks fine, check the line above it: a mistake there often shows up one line later.",
    ],
  },

  // -- IndentationError: the spaces at the start of a line ----------------
  {
    id: "indentation-unexpected",
    names: INDENTATION,
    pattern: /unexpected indent/,
    title: "This line is pushed in too far",
    summary:
      "Spaces at the start of a line mean something in Python: they show which lines belong inside a block, such as an `if`. This line starts with spaces (or a tab) but isn't inside any block.",
    tips: [
      "Remove the spaces at the start of line {line} so it lines up with the lines around it.",
      "Only indent the lines that come after a line ending in `:`.",
    ],
  },
  {
    id: "indentation-expected-block",
    names: INDENTATION,
    pattern: /expected an indented block/,
    title: "A block with nothing inside it",
    summary:
      "A line ending in `:` must be followed by at least one indented line: the code that belongs to it. Python found nothing indented underneath.",
    tips: [
      "Indent the lines that belong to the block by 4 spaces (or press Tab).",
      "If you haven't written that part yet, put an indented `pass` there for now.",
    ],
  },
  {
    id: "indentation-mismatch",
    names: INDENTATION,
    pattern: /unindent does not match|inconsistent use of tabs/,
    title: "The indentation doesn't line up",
    summary:
      "Lines in the same block must start at exactly the same position. This line is indented by a different amount than the lines it should line up with.",
    tips: [
      "Line it up exactly with the lines above it that belong to the same block.",
      "Use 4 spaces for each level, and don't mix tabs and spaces.",
    ],
  },
  {
    id: "indentation-general",
    names: INDENTATION,
    title: "A problem with indentation",
    summary:
      "Python uses the spaces at the start of each line to see which lines belong together. The spacing on this line doesn't fit.",
    tips: [
      "Make lines in the same block start at exactly the same position.",
      "Use 4 spaces for each level, and don't mix tabs and spaces.",
    ],
  },

  // -- NameError: a name Python doesn't know ------------------------------
  {
    id: "name-blank",
    names: ["NameError"],
    pattern: /name '(_+)' is not defined/,
    groups: ["id"],
    title: "There's a blank left to fill in",
    summary: "`{id}` marks a gap in the starter code. Python can't run it until you replace it with your own code.",
    tips: [
      "Replace `{id}` with your answer; the exercise instructions say what goes there.",
      "Then press Run again.",
    ],
  },
  {
    id: "name-not-defined-suggestion",
    names: ["NameError"],
    pattern: /name '([^']+)' is not defined\. Did you mean: '([^']+)'\?/,
    groups: ["id", "suggestion"],
    title: "Python doesn't know anything called `{id}`",
    summary:
      "You used `{id}`, but nothing has that name. Python noticed something with a similar name, `{suggestion}`; a small typo or a capital letter is the usual cause.",
    tips: [
      "If you meant `{suggestion}`, fix the spelling. Capitals matter: `Name` and `name` are different names.",
      'If `{id}` was meant as text to show, put it in quotes: `"{id}"`.',
      "If it's a variable, check that a line above this one creates it with `=`.",
    ],
  },
  {
    id: "name-not-defined",
    names: ["NameError"],
    pattern: /name '([^']+)' is not defined/,
    groups: ["id"],
    title: "Python doesn't know anything called `{id}`",
    summary:
      "You used `{id}`, but at this point nothing has that name yet. Python only knows its own built-in names and the ones your code has already created.",
    tips: [
      "If `{id}` is a variable, the line that creates it (`{id} = ...`) must come before this line and be spelled the same way.",
      'If it was meant as text, put it in quotes: `"{id}"`.',
      "Check the spelling and the capital letters.",
    ],
  },

  // -- TypeError: the right kind of value in the wrong place --------------
  {
    id: "type-concatenate-str",
    names: ["TypeError"],
    pattern: /can only concatenate str \(not "(\w+)"\) to str/,
    groups: ["otherType"],
    title: "Text can only be joined with more text",
    summary:
      "`+` can join two pieces of text, or add two numbers, but it can't mix them. Here, text is being joined with {otherTypeLabel}.",
    tips: [
      'Turn the number into text first with `str()`: `"Age: " + str(age)`.',
      'Or let `print` do it: separate the parts with commas, `print("Age:", age)`.',
      "If you meant to do maths, turn the text into a number with `int()` or `float()`.",
    ],
  },
  {
    id: "type-unsupported-operand",
    names: ["TypeError"],
    pattern: /unsupported operand type\(s\) for (\S+?): '(\w+)' and '(\w+)'/,
    groups: ["op", "leftType", "rightType"],
    title: "`{op}` doesn't work between these two values",
    summary:
      "The value on the left is {leftTypeLabel} and the one on the right is {rightTypeLabel}. Python doesn't know how to use `{op}` with that combination.",
    tips: [
      'Text that looks like a number, like `"5"`, is still text. Use `int()` or `float()` to turn it into a number.',
      "To join a number to text, use `str()` on the number first.",
      "`print(type(x))` shows what kind of value a variable holds.",
    ],
  },
  {
    id: "type-multiply-sequence",
    names: ["TypeError"],
    pattern: /can't multiply sequence by non-int of type '(\w+)'/,
    groups: ["otherType"],
    title: "Text can only be repeated a whole number of times",
    summary:
      'Multiplying text by a whole number repeats it: `"ha" * 3` gives `hahaha`. Here, it is multiplied by {otherTypeLabel}, which Python can\'t do.',
    tips: [
      "If the number is stored as text (for example from `input()`), turn it into a whole number with `int()` first.",
      "If you meant to multiply numbers, check that both values really are numbers.",
    ],
  },
  {
    id: "type-not-callable",
    names: ["TypeError"],
    pattern: /'(\w+)' object is not callable/,
    groups: ["objType"],
    title: "That can't be run like a function",
    summary:
      "Round brackets straight after something, like `name()`, mean \"run this\". Here the brackets come after {objTypeLabel}, which can't be run.",
    tips: [
      "Check whether a function name, like `print` or `input`, is also used as a variable name: after `print = 5`, `print` is just a number.",
      "If you meant to multiply, Python needs a `*`: `2 * (3 + 4)`, not `2(3 + 4)`.",
    ],
  },
  {
    id: "type-no-len",
    names: ["TypeError"],
    pattern: /object of type '(\w+)' has no len\(\)/,
    groups: ["objType"],
    title: "`len()` can't measure that",
    summary: "`len()` counts the items in text, a list or a dictionary. Here it was given {objTypeLabel}, which has no length.",
    tips: ["To count the digits of a number, turn it into text first: `len(str(number))`."],
  },
  {
    id: "type-general",
    names: ["TypeError"],
    title: "A value of the wrong kind",
    summary:
      "Python was asked to do something with a kind of value that doesn't support it, such as doing maths with text.",
    tips: [
      "The last line of the error names the kinds (types) of value involved.",
      "`print(type(x))` shows what kind of value a variable holds.",
      "Convert values with `int()`, `float()` or `str()` where needed.",
    ],
  },

  // -- ValueError: the right kind of value, but unusable content ----------
  {
    id: "value-invalid-int",
    names: ["ValueError"],
    pattern: /invalid literal for int\(\) with base 10: (.+)/,
    groups: ["value"],
    title: "That text isn't a whole number",
    summary:
      '`int()` turns text into a whole number, but only if the text looks like one, such as `"42"`. It was given `{value}`.',
    tips: [
      "If the value came from `input()`, check what you typed: digits only, no letters or spaces.",
      'For numbers with a decimal point, like `"3.5"`, use `float()` instead of `int()`.',
    ],
  },
  {
    id: "value-invalid-float",
    names: ["ValueError"],
    pattern: /could not convert string to float: (.+)/,
    groups: ["value"],
    title: "That text isn't a number",
    summary:
      '`float()` turns text into a number, but only if the text looks like one, such as `"3.5"` or `"10"`. It was given `{value}`.',
    tips: [
      "Use a dot for decimals, not a comma: `3.5`, not `3,5`.",
      "If the value came from `input()`, check what you typed.",
    ],
  },
  {
    id: "value-general",
    names: ["ValueError"],
    title: "A value Python can't use here",
    summary: "The value is the right kind, but what it contains doesn't make sense for what was asked.",
    tips: [
      "The last line of the error shows which value caused the problem.",
      "Print the value just before this line to see what it really holds.",
    ],
  },

  // -- Other runtime errors ----------------------------------------------
  {
    id: "zero-division",
    names: ["ZeroDivisionError"],
    title: "Dividing by zero",
    summary: "Nothing can be divided by zero, in maths or in Python. This applies to `/`, `//` and `%`.",
    tips: [
      "Check the number after `/`, `//` or `%` on line {line}. If it's a variable, print it just before to see its value.",
      "If zero can really happen, check for it with an `if` before dividing.",
    ],
  },
  {
    id: "attribute-suggestion",
    names: ["AttributeError"],
    pattern: /'(\w+)' object has no attribute '([^']+)'\. Did you mean: '([^']+)'\?/,
    groups: ["objType", "attr", "suggestion"],
    title: "`.{attr}` doesn't exist for this value",
    summary:
      "The part after the dot, `.{attr}`, isn't something {objTypeLabel} has. Python noticed a similar name: `.{suggestion}`.",
    tips: ["If you meant `.{suggestion}`, fix the spelling.", "Names after the dot care about capitals too."],
  },
  {
    id: "attribute",
    names: ["AttributeError"],
    pattern: /'(\w+)' object has no attribute '([^']+)'/,
    groups: ["objType", "attr"],
    title: "`.{attr}` doesn't exist for this value",
    summary:
      "The part after the dot, `.{attr}`, isn't something {objTypeLabel} has. Each kind of value has its own set of tools: text has `.upper()`, lists have `.append()`, and so on.",
    tips: [
      "Check the spelling of `.{attr}`.",
      "Check that the value is the kind you expect: `print(type(x))`.",
    ],
  },
  {
    id: "attribute-general",
    names: ["AttributeError"],
    title: "The part after the dot doesn't exist",
    summary: "The name after the dot isn't available on the value or module before the dot.",
    tips: ["Check the spelling of the name after the dot, including capitals."],
  },
  {
    id: "index-out-of-range",
    names: ["IndexError"],
    title: "That position doesn't exist",
    summary:
      "Positions start counting at 0, so in text or a list with 3 items the valid positions are 0, 1 and 2. This line asks for a position past the end.",
    tips: [
      "`len()` tells you how many items there are; the last position is one less.",
      "Position `-1` always means the last item, even when you don't know the length.",
    ],
  },
  {
    id: "key-missing",
    names: ["KeyError"],
    title: "That key isn't in the dictionary",
    summary: "A dictionary only has the keys that were put into it. This line looks up `{message}`, which isn't one of them.",
    tips: [
      "Check the spelling and capitals of the key.",
      "If a missing key is fine, use `.get()`: it gives `None` instead of an error.",
    ],
  },
  {
    id: "module-not-found",
    names: ["ModuleNotFoundError"],
    pattern: /No module named '([^']+)'/,
    groups: ["module"],
    title: "Python can't find a module called `{module}`",
    summary:
      "`import` loads extra tools by name. There's no module called `{module}` here: the name may be misspelled, or it's a package that isn't available in the browser.",
    tips: [
      "Check the spelling, e.g. `math`, `random` or `datetime`.",
      "Only Python's built-in modules work here; packages such as `numpy` aren't installed.",
    ],
  },
  {
    // Raised by our own harness (runnerCore.ts) when the page can't pause
    // for input; the program itself is fine.
    id: "input-unavailable",
    names: ["RuntimeError"],
    pattern: /^input\(\) is not available/,
    title: "`input()` can't work in this browser window",
    summary:
      "Your code is fine. This browser window doesn't let CodeStart pause your program to wait for what you type.",
    tips: [
      "Reload the page and press Run again.",
      "If that doesn't help, try an up-to-date Chrome, Edge, Firefox or Safari.",
    ],
  },
];

const FALLBACK: Rule = {
  id: "general",
  names: [],
  title: "Your program stopped with {errorName}",
  summary:
    "Python hit a problem it couldn't get past, so the program stopped there. Anything printed before that point ran normally.",
  tips: [
    "Read the last line of the error: it names the problem and often gives a hint.",
    "Start at line {line}, then look at the lines just before it.",
  ],
};

const PLACEHOLDER = /\{(\w+)\}/g;

// Splits a template into plain and code segments, then fills placeholders.
// Values are inserted as plain text after splitting, so a backtick or brace
// inside the learner's own names can never change the formatting.
function fill(template: string, values: Record<string, string>): Segment[] {
  return template
    .split("`")
    .map((part, index) => ({
      text: part.replace(PLACEHOLDER, (_, key: string) => values[key] ?? ""),
      code: index % 2 === 1,
    }))
    .filter((segment) => segment.text !== "");
}

function hasAllValues(template: string, values: Record<string, string>): boolean {
  return [...template.matchAll(PLACEHOLDER)].every(([, key]) => key in values);
}

// The plain-language explanation for an error, or null for the "errors" that
// need none (Stop, sys.exit()).
export function explainError({ name, message, line }: ErrorDetails): Explanation | null {
  if (NOT_EXPLAINED.has(name)) return null;

  let rule = FALLBACK;
  const groups: Record<string, string> = {};
  for (const candidate of RULES) {
    if (!candidate.names.includes(name)) continue;
    if (!candidate.pattern) {
      rule = candidate;
      break;
    }
    const match = candidate.pattern.exec(message);
    if (match) {
      rule = candidate;
      // Optional groups that didn't match come back as undefined: leave
      // them out, so tips that need them are skipped.
      (candidate.groups ?? []).forEach((key, index) => {
        const value = match[index + 1];
        if (value !== undefined) groups[key] = value;
      });
      break;
    }
  }

  const values: Record<string, string> = { errorName: name, message, ...groups };
  if (line !== null) values.line = String(line);
  for (const [key, value] of Object.entries(groups)) {
    if (key.endsWith("Type")) values[`${key}Label`] = typeLabel(value);
  }

  return {
    id: rule.id,
    title: fill(rule.title, values),
    summary: fill(rule.summary, values),
    tips: rule.tips.filter((tip) => hasAllValues(tip, values)).map((tip) => fill(tip, values)),
  };
}
