from pydantic import BaseModel


class Item(BaseModel):
    """Item model for the API."""

    id: int
    name: str
    description: str
