---
title: When things go wrong
type: concept
minutes: 6
---
Sooner or later, you'll press Run and get a block of red text instead of what you expected. That's an **error**, and it happens to every programmer, every day. An error isn't a sign that you're bad at this. It's Python telling you, as precisely as it can, where it got stuck.

## Reading an error

Here's a program with a small typo on line 2:

```python
print("Good morning")
pritn("Time for coffee")
```

Running it shows:

```
Good morning
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    pritn("Time for coffee")
    ^^^^^
NameError: name 'pritn' is not defined. Did you mean: 'print'?
```

Read it from the bottom up:

1. **The last line is the most important.** It names the kind of error (`NameError`) and says what's wrong: Python has never heard of anything called `pritn`. Here it even guesses what you meant.
2. **The line number** tells you where to look: `line 2`.
3. **The code and the `^` marks** under it show the exact spot.

Notice that `Good morning` still appeared. Python ran line 1 without trouble and only stopped when it reached the problem.

## Help next to the error

Under the output box, CodeStart adds a short explanation in everyday words, titled **What this error means**. It describes what usually causes that kind of error and lists a few things to check. Read the red text first, then use the explanation if the red text isn't clear yet.

## When nothing runs at all

Some mistakes stop Python before it runs a single line. A missing quote or bracket means Python can't even read the program, so it reports a `SyntaxError` and shows no output at all. *Syntax* means the grammar of a language: the rules for how its words and symbols fit together.

## The usual suspects

Most early errors come from a handful of small slips:

- A missing quote: `print("Hello)`
- A missing bracket: `print("Hello"`
- A typo in a name: `pritn`, or `Print` with a capital P
- Text without quotes: `print(Hello)`

The three exercises below each contain one of these. Run each one first and read the error, *then* fix it.

## Recap

- Errors are normal. Read them from the bottom up: the last line names the problem, and the line number shows where.
- Lines before the error still run, but a `SyntaxError` means Python couldn't read the program, so nothing runs.
- Most early errors are small slips: a missing quote or bracket, a typo in a name, or text without quotes.
