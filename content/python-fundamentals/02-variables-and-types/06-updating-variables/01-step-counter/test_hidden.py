def test_updates_with_plus_equals(source):
    assert source.count("+=") >= 3


def test_does_not_type_the_totals(source):
    assert "4700" not in source and "5500" not in source
