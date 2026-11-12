def test_blanks_are_filled(source):
    assert "___" not in source


def test_python_does_the_dividing(source):
    assert "//" in source and "%" in source
    lines = [line.replace(" ", "") for line in source.splitlines()]
    assert "minutes=3" not in lines and "seconds=20" not in lines
