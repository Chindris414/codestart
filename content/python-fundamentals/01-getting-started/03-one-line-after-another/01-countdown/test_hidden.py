def test_keeps_four_prints(source):
    assert source.count("print(") == 4
