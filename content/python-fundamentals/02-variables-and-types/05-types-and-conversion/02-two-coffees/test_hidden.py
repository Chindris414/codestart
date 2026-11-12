def test_converts_the_text(source):
    assert "float(price_text)" in source


def test_does_not_type_the_answer(source):
    assert "9.0" not in source and "= 9" not in source
