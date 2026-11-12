def test_repeats_with_star(source):
    assert "*" in source
    assert "-----" not in source
