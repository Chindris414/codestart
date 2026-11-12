---
title: Naming rules
type: concept
minutes: 4
---
You choose your variable names yourself, but Python has a few rules about what a name may look like.

## What's allowed

- Letters, digits and the underscore `_`: `score`, `player_2`, `total_price`.
- A name **can't start with a digit**: `2nd_player` isn't allowed, but `player_2` is.
- **No spaces.** Join words with an underscore instead: `first_name`, not `first name`. This style, lowercase words joined by `_`, is what most Python programmers use.
- A few words already belong to Python and can't be names, such as `if`, `for`, `True` and `None`.

## Capitals matter

To Python, `name`, `Name` and `NAME` are three different names. A variable created as `colour` can't be used as `Colour`:

```python
colour = "green"
print(Colour)
```

```
Traceback (most recent call last):
  File "main.py", line 2, in <module>
    print(Colour)
          ^^^^^^
NameError: name 'Colour' is not defined. Did you mean: 'colour'?
```

Sticking to lowercase names avoids this whole kind of mistake.

## Don't reuse Python's own names

Python lets you write `print = 5`, but afterwards `print` is just a number, and the next `print("Hi")` fails with a `TypeError`. Pick names that aren't already used for something, like `print` and `input`.

## Good names

Python doesn't care whether a name is `x` or `price_in_euros`, but people do. A good name says what the value *is*, so the code reads almost like a sentence:

```python
seconds_per_minute = 60
minutes_per_hour = 60
print(seconds_per_minute * minutes_per_hour)
```

```
3600
```

## Recap

- Names use letters, digits and `_`, can't start with a digit, and can't contain spaces.
- Capitals matter: `name` and `Name` are different variables, so stick to lowercase.
- Choose names that say what the value is, and don't reuse names like `print`.
