def test_prints_both_names(run):
    assert run().output.strip() == "Ana and Ben"
