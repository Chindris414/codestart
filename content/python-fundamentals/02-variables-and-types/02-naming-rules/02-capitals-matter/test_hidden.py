def test_uses_a_lowercase_name(source):
    assert "Greeting" not in source
    assert "print(greeting)" in source
