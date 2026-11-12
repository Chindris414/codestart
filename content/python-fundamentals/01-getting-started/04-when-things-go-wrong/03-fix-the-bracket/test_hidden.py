def test_brackets_are_balanced(source):
    assert source.count("(") == source.count(")")
