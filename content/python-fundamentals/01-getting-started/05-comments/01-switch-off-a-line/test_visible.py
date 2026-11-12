def test_prints_the_list_without_the_joke(run):
    assert run().output.splitlines() == ["Shopping list:", "- bread", "- apples"]
