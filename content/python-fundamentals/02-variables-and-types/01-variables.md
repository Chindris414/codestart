---
title: Boxes with names
type: concept
minutes: 5
---
So far, every value in your programs has been typed straight into a `print()`. Real programs need to remember things: a score, a name, a price. For that, Python has **variables**.

A variable is a name that points to a value. Think of a box with a label on it: the label is the name, and the value is what's inside.

```python
age = 29
print(age)
```

```
29
```

The `=` sign doesn't mean "equals" here, the way it does in maths. Read it as **"store"**: *store 29 under the name `age`*. The name goes on the left and the value on the right. From then on, wherever you write `age`, Python uses 29.

## Name or text?

Quotes make all the difference:

```python
city = "Lisbon"
print(city)
print("city")
```

```
Lisbon
city
```

Without quotes, `city` is a variable, and Python shows what's stored in it. With quotes, `"city"` is just text.

## Changing what's in the box

Storing a new value under the same name replaces the old one. The old value is gone:

```python
weather = "sunny"
print(weather)
weather = "rainy"
print(weather)
```

```
sunny
rainy
```

Because Python runs from the top down, a variable has to be created *before* the line that uses it. Use it too early and you'll get a `NameError`.

## Printing several things at once

`print()` can show several values in one line. Separate them with commas, and Python puts a space between each:

```python
name = "Sam"
age = 29
print("Name:", name, "Age:", age)
```

```
Name: Sam Age: 29
```

## Recap

- A variable is a name for a value; `=` stores the value on the right under the name on the left.
- Storing a new value under the same name replaces the old one, and a variable must be created before it's used.
- `print()` can show several values separated by commas, with a space between each.
