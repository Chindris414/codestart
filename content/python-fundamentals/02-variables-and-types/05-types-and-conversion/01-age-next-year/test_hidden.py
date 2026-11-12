def test_age_is_still_text(source):
    assert source.splitlines()[0].replace(" ", "") == 'age="29"'


def test_converts_and_adds(source):
    assert "int(age)" in source
    assert "30" not in source
