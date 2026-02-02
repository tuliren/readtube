from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_endpoint() -> None:
    """Test the root endpoint returns the expected response."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Welcome to Turbo Template Backend API"}


def test_health_check() -> None:
    """Test the health check endpoint returns healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_get_items() -> None:
    """Test the items endpoint returns a list of items."""
    response = client.get("/api/items")
    assert response.status_code == 200
    assert len(response.json()) == 3
    assert response.json()[0]["id"] == 1


def test_get_item() -> None:
    """Test getting a specific item by ID."""
    response = client.get("/api/items/1")
    assert response.status_code == 200
    assert response.json()["id"] == 1
    assert "name" in response.json()
    assert "description" in response.json()


def test_get_nonexistent_item() -> None:
    """Test getting a nonexistent item returns an error."""
    response = client.get("/api/items/999")
    assert response.status_code == 200  # FastAPI returns 200 by default
    assert "error" in response.json()
