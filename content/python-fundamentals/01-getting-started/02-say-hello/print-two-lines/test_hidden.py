def test_uses_one_print_per_line(source):
    assert source.count("print(") >= 2
