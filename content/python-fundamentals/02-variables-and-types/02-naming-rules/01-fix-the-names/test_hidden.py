def test_uses_the_new_names(source):
    assert "first_place" in source
    assert "second_place" in source
    assert "1st_place" not in source
