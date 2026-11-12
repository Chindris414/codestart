EXPECTED = [
    "CodeStart Stationery",
    "------------------------",
    "Notebooks: 3 x 4 = 12",
    "Pens: 5 x 2 = 10",
    "------------------------",
    "Total: 22",
    "Paid: 50",
    "Change: 28",
]


def test_prints_the_receipt(run):
    lines = [line.rstrip() for line in run().output.splitlines()]
    assert lines == EXPECTED
