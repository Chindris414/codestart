EXPECTED = [
    "====================",
    "",
    "  HELLO, my name is",
    "  Sam",
    "",
    "====================",
]


def test_prints_the_card(run):
    lines = [line.rstrip() for line in run().output.splitlines()]
    assert lines == EXPECTED
