from app.schemas.base import CamelModel


class CharDistributionResponse(CamelModel):
    task_id: int
    letters: dict[str, int]
    digits: dict[str, int]
