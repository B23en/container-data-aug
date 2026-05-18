from app.schemas.base import CamelModel


class BgColorDistributionResponse(CamelModel):
    task_id: int
    analyzed_image_count: int
    distribution: dict[str, float]
