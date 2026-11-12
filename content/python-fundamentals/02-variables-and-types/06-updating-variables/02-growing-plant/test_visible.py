def test_prints_three_weeks_of_growth(run):
    assert run().output.splitlines() == ["Week 1: 4 cm", "Week 2: 8 cm", "Week 3: 16 cm"]
