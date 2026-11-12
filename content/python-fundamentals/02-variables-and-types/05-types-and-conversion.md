---
title: Types and conversion
type: concept
minutes: 6
---
Every value in Python has a **type**: the kind of value it is. You've met three so far:

| Type | Kind of value | Examples |
| --- | --- | --- |
| `int` | whole number | `29`, `-4` |
| `float` | decimal number | `3.5`, `10.0` |
| `str` | text | `"hello"`, `"29"` |

`type()` tells you the type of any value, which is useful when something behaves strangely:

```python
print(type(29))
print(type("29"))
```

```
<class 'int'>
<class 'str'>
```

## 5 and "5" are not the same

`5` is a number. `"5"` is text that happens to look like a number, and Python treats it like any other text:

```python
print(5 + 5)
print("5" + "5")
```

```
10
55
```

Mixing the two, as in `"5" + 5`, gives a `TypeError`: Python won't guess whether you meant to join text or add numbers.

This matters more than it seems. In the next module you'll read what the user types with `input()`, and that always arrives as text, even when the user types a number.

## Converting between types

Each type's name also works as a converter:

- `int("29")` turns text into a whole number: `29`.
- `float("3.5")` turns text into a decimal number: `3.5`.
- `str(29)` turns a number into text: `"29"`.

```python
age_text = "29"
age = int(age_text)
print(age + 1)
print("You are " + str(age) + " years old")
```

```
30
You are 29 years old
```

The text has to look like the type you're asking for. `int("hello")` and `int("3.5")` both fail with a `ValueError`, because neither one is a whole number.

## Recap

- Every value has a type, such as `int`, `float` or `str`, and `type()` shows which one.
- `"5"` is text and `5` is a number; Python won't mix them with `+`.
- `int()`, `float()` and `str()` convert a value to that type, if the value makes sense as one.
