def test_joins_the_two_variables(source):
    assert "+" in source
    assert "first_name +" in source or "first_name+" in source
    assert "Sam Rivera" not in source
