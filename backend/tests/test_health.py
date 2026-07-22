def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_docs_render(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200
