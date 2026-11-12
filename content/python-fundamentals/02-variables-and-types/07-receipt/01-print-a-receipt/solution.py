# Prices in euros
notebook_price = 4
pen_price = 2

# What the customer bought, and how much they paid
notebooks = 3
pens = 5
paid = 50

# Print the receipt below.
line = "-" * 24
total = 0

print("CodeStart Stationery")
print(line)

notebooks_cost = notebooks * notebook_price
total += notebooks_cost
print("Notebooks:", notebooks, "x", notebook_price, "=", notebooks_cost)

pens_cost = pens * pen_price
total += pens_cost
print("Pens:", pens, "x", pen_price, "=", pens_cost)

print(line)
print("Total:", total)
print("Paid:", paid)
print("Change:", paid - total)
