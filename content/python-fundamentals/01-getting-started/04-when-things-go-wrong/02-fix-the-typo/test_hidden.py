def test_typo_is_gone(source):
    assert "pritn" not in source


def test_still_three_prints(source):
    assert source.count("print(") == 3
