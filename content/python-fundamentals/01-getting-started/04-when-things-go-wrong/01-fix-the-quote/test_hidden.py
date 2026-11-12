def test_text_has_both_quotes(source):
    assert source.count('"') % 2 == 0 and source.count("'") % 2 == 0
