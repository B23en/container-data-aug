import csv
import math
from pathlib import Path

import numpy as np
from PIL import Image

from app.augmentation.shuffle import _make_global_mask
from app.core.errors import ApiError
from app.repositories import projects_repo, tasks_repo
from app.repositories.postgres import PostgresDatabase

_FINISHED_STATUSES = {"DONE", "FAILED", "STOPPED"}

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}

REPRESENTATIVE_COLORS: dict[str, tuple[int, int, int]] = {
    "red":    (255, 0, 0),
    "orange": (255, 165, 0),
    "yellow": (255, 255, 0),
    "green":  (0, 128, 0),
    "blue":   (0, 0, 255),
    "purple": (128, 0, 128),
    "pink":   (255, 192, 203),
    "brown":  (165, 42, 42),
    "white":  (255, 255, 255),
    "gray":   (128, 128, 128),
    "black":  (0, 0, 0),
}


class BgColorDistributionService:
    def __init__(self, db: PostgresDatabase) -> None:
        self._db = db

    def get_distribution(self, task_id: int) -> dict:
        with self._db.connect() as conn:
            task = tasks_repo.get_by_id(conn, task_id)
            if task is None:
                raise ApiError(
                    "TASK_NOT_FOUND",
                    "Task not found",
                    status_code=404,
                    details={"taskId": task_id},
                )
            if task["status"] not in _FINISHED_STATUSES:
                raise ApiError(
                    "TASK_NOT_FINISHED",
                    "Task is not finished yet",
                    status_code=409,
                    details={"taskId": task_id, "status": task["status"]},
                )
            project = projects_repo.get_by_id(conn, task["project_id"])

        output_folder = Path(task["output_folder_path"])
        source_folder = Path(project["source_folder_path"])

        # 색별 가중 누적 합계와 전체 가중치
        weighted: dict[str, float] = {color: 0.0 for color in REPRESENTATIVE_COLORS}
        total_weight = 0
        analyzed_count = 0

        for csv_path in output_folder.rglob("*_labels.csv"):
            n = _count_data_rows(csv_path)
            if n == 0:
                continue

            relative_dir = csv_path.parent.relative_to(output_folder)
            stem = csv_path.name.replace("_labels.csv", "")
            src_image = _find_source_image(source_folder / relative_dir, stem)
            if src_image is None:
                continue

            try:
                ratios = _analyze_background(src_image)
            except Exception as exc:
                raise ApiError(
                    "INTERNAL_SERVER_ERROR",
                    f"Failed to analyze image: {src_image.name}",
                    status_code=500,
                ) from exc

            for color, ratio in ratios.items():
                weighted[color] += ratio * n
            total_weight += n
            analyzed_count += 1

        if total_weight == 0:
            distribution = {color: 0.0 for color in REPRESENTATIVE_COLORS}
        else:
            distribution = {
                color: round(weighted[color] / total_weight, 2)
                for color in REPRESENTATIVE_COLORS
            }

        return {
            "task_id": task_id,
            "analyzed_image_count": analyzed_count,
            "distribution": distribution,
        }


def _count_data_rows(csv_path: Path) -> int:
    try:
        with csv_path.open(encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            return sum(1 for _ in reader)
    except Exception:
        return 0


def _find_source_image(directory: Path, stem: str) -> Path | None:
    for ext in _IMAGE_EXTENSIONS:
        candidate = directory / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    return None


def _analyze_background(image_path: Path) -> dict[str, float]:
    with Image.open(image_path) as raw:
        image = raw.convert("RGB")

    mask = _make_global_mask(image)
    mask_arr = np.array(mask)
    img_arr = np.array(image)

    # 마스크 0 = 배경 픽셀
    bg_pixels = img_arr[mask_arr == 0]
    if len(bg_pixels) == 0:
        return {color: 0.0 for color in REPRESENTATIVE_COLORS}

    counts: dict[str, int] = {color: 0 for color in REPRESENTATIVE_COLORS}
    for r, g, b in bg_pixels:
        color = _classify(int(r), int(g), int(b))
        counts[color] += 1

    total = len(bg_pixels)
    return {color: round(cnt / total * 100, 4) for color, cnt in counts.items()}


def _classify(r: int, g: int, b: int) -> str:
    return min(
        REPRESENTATIVE_COLORS,
        key=lambda name: math.dist((r, g, b), REPRESENTATIVE_COLORS[name]),
    )
