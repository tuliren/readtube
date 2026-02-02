from fastapi import APIRouter

from app.items.types import Item

router = APIRouter(
    prefix="/api/items",
    tags=["items"],
)

items = {
    1: Item(id=1, name="Item 1", description="Description for Item 1"),
    2: Item(id=2, name="Item 2", description="Description for Item 2"),
    3: Item(id=3, name="Item 3", description="Description for Item 3"),
}


@router.get("/")
async def get_items() -> list[Item]:
    """Demo endpoint returning a list of items."""
    return list(items.values())


@router.get("/{item_id}")
async def get_item(item_id: int) -> Item | dict[str, str]:
    """Demo endpoint returning a specific item by ID."""
    if item_id not in items:
        return {"error": "Item not found"}

    return items[item_id]
