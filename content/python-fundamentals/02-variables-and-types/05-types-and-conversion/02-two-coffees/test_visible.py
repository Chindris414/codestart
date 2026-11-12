def test_prints_the_price_of_two(run):
    assert run().output.strip() == "Two coffees: 9.0"
