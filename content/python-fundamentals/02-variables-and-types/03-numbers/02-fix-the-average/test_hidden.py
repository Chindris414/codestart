def test_still_calculates_it(source):
    assert "/ 3" in source or "/3" in source
    assert "4" in source and "8" in source and "9" in source


def test_uses_brackets(source):
    assert source.count("(") >= 2
