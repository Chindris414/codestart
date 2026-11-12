def test_prints_next_years_age(run):
    assert run().output.strip() == "Next year you will be 30"
