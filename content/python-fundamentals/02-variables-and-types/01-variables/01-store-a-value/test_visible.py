def test_prints_the_sentence(run):
    assert run().output.strip() == "I would like to visit Mars"
