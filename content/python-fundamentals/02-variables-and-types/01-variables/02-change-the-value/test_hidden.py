def test_both_prints_use_the_variable(source):
    assert source.count('print("Score:", score)') == 2


def test_stores_the_new_value(source):
    assert "score=25" in source.replace(" ", "")
