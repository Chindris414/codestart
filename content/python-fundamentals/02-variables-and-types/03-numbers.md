---
title: Numbers
type: concept
minutes: 6
---
Python has two main kinds of numbers:

- **Whole numbers**, like `7`, `0` or `-12`. Python calls them `int`, short for *integer*.
- **Decimal numbers**, like `3.5` or `0.25`. Python calls them `float`. Always write the decimal point as a dot: `3.5`, not `3,5`.

## Doing maths

| Symbol | Meaning | Example | Result |
| --- | --- | --- | --- |
| `+` | add | `7 + 2` | `9` |
| `-` | take away | `7 - 2` | `5` |
| `*` | multiply | `7 * 2` | `14` |
| `/` | divide | `7 / 2` | `3.5` |
| `//` | divide, keep only the whole part | `7 // 2` | `3` |
| `%` | the remainder after dividing | `7 % 2` | `1` |
| `**` | to the power of | `7 ** 2` | `49` |

Two of these need a closer look:

- `/` always gives a decimal number, even when the division comes out even: `10 / 2` is `5.0`.
- `//` and `%` are a pair. `17 // 5` is `3` (5 fits into 17 three times) and `17 % 5` is `2` (with 2 left over). They're handy for things like turning minutes into hours and minutes.

```python
total_minutes = 135
hours = total_minutes // 60
minutes = total_minutes % 60
print(hours, "hours and", minutes, "minutes")
```

```
2 hours and 15 minutes
```

## Which part goes first

Python follows the same order as maths: `**` first, then `*`, `/`, `//` and `%`, and only then `+` and `-`. Use round brackets to choose the order yourself:

```python
print(2 + 3 * 4)
print((2 + 3) * 4)
```

```
14
20
```

When you're not sure which part goes first, add brackets. They never hurt, and they make your meaning clear to the next reader.

## A tiny surprise

Computers store decimal numbers in a way that isn't always exact, so `0.1 + 0.2` shows `0.30000000000000004`. This isn't a mistake in your code, and it happens in nearly every programming language. For now, just don't be alarmed when you see it.

## Recap

- Whole numbers are `int` and decimal numbers are `float`; write decimals with a dot.
- `+ - * /` work as in maths; `//` keeps the whole part of a division, `%` gives the remainder and `**` raises to a power.
- `**` goes first, then `* / // %`, then `+ -`; use brackets to choose the order yourself.
