---
title: One line after another
type: concept
minutes: 5
---
Python runs a program one line at a time, starting at the top. Each line finishes before the next one starts. Swap two lines and you swap what happens, and in what order.

```python
print("Ready")
print("Steady")
print("Go!")
```

```
Ready
Steady
Go!
```

## An empty line

`print()` with nothing inside the brackets prints an empty line. It's handy for adding space between parts of your output:

```python
print("Chapter 1")
print()
print("It was a quiet morning.")
```

```
Chapter 1

It was a quiet morning.
```

## Numbers don't need quotes

Quotes are for text. A number can go into `print()` on its own, and so can a calculation. Python works it out first and then shows the answer:

```python
print(7)
print(3 + 4)
print("3 + 4")
```

```
7
7
3 + 4
```

Look at the last two lines. Without quotes, `3 + 4` is maths, and Python shows the result. With quotes, `"3 + 4"` is just text, and Python shows it exactly as written.

You can use `+` and `-` for adding and taking away, `*` for multiplying and `/` for dividing. There's much more about numbers in the next module.

## Recap

- Python runs one line at a time, from the top down, so the order of your lines is the order things happen.
- `print()` with nothing inside prints an empty line.
- Numbers and calculations go into `print()` without quotes; with quotes they're just text.
