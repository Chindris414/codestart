---
title: Updating variables
type: concept
minutes: 4
---
Often a new value depends on the old one: a score goes up by 10, a balance goes down after you pay, a counter goes up by 1. Python lets you use a variable on both sides of `=`:

```python
score = 50
score = score + 10
print(score)
```

```
60
```

In maths, `score = score + 10` would make no sense. In Python, it's an instruction carried out **right side first**: take what's in `score` now (50), add 10, then store the result (60) back under `score`.

## The short way: +=

This happens so often that Python has a shorter way to write it. `score += 10` means exactly the same as `score = score + 10`. The other maths symbols work the same way:

| Short | Means |
| --- | --- |
| `x += 3` | `x = x + 3` |
| `x -= 3` | `x = x - 3` |
| `x *= 3` | `x = x * 3` |
| `x /= 3` | `x = x / 3` |

```python
coins = 10
coins -= 4
coins *= 2
print(coins)
```

```
12
```

`+=` works on strings too: `message += "!"` adds an exclamation mark to the end of `message`.

## The variable must exist first

`total += 5` reads `total` before changing it, so `total` must already have a value. A common pattern is to start a variable at `0` and then add to it as the program goes along.

## Recap

- `x = x + 1` works right side first: Python takes the old value, changes it, and stores the result back.
- `+=`, `-=`, `*=` and `/=` are short ways to update a variable.
- A variable must already have a value before you can update it, so start totals at `0`.
