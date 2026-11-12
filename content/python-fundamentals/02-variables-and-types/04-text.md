---
title: Text (strings)
type: concept
minutes: 5
---
A piece of text in Python is called a **string**, short for "a string of characters". Python's name for this kind of value is `str`. You've been writing strings since your first `print("Hello!")`.

## Single or double quotes

A string can use double quotes `"..."` or single quotes `'...'`. Both work the same, as long as the start and end match. Pick the one that doesn't appear *inside* the text:

```python
print("It's raining.")
print('She said "hi" to me.')
```

```
It's raining.
She said "hi" to me.
```

A string with nothing between the quotes, `""`, is an *empty string*. It's still a string, just one with no characters in it.

## Joining strings with +

`+` between two strings joins them into one. Python doesn't add a space for you, so put any spaces inside the quotes:

```python
first_name = "Sam"
greeting = "Hello, " + first_name + "!"
print(greeting)
```

```
Hello, Sam!
```

This is different from commas in `print()`. Commas put a space between the values for you, but they only work inside `print()`. `+` builds a brand-new string that you can store in a variable.

## Repeating strings with *

A string times a whole number repeats it:

```python
print("ha" * 3)
print("-" * 12)
```

```
hahaha
------------
```

## How long is it?

`len()` counts the characters in a string, including spaces and punctuation:

```python
print(len("Hello, Sam!"))
```

```
11
```

## Recap

- A string is text between matching quotes, `"..."` or `'...'`; use the kind that isn't inside the text.
- `+` joins strings into one without adding spaces, and `*` repeats a string a whole number of times.
- `len()` tells you how many characters a string has.
