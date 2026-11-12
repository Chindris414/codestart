def test_uses_print(source):
    assert "print" in source


def test_prints_a_single_line(run):
    assert run().output.strip().splitlines() == ["Hello, world!"]
