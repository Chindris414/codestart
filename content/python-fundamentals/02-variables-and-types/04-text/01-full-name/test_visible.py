def test_prints_the_full_name(run):
    assert run().output.strip() == "Sam Rivera"
