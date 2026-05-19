import csv
from pathlib import Path

from app.core.errors import ApiError
from app.repositories import tasks_repo
from app.repositories.postgres import PostgresDatabase

_FINISHED_STATUSES = {"DONE", "FAILED", "STOPPED"}


class CharDistributionService:
    def __init__(self, db: PostgresDatabase) -> None:
        self._db = db

    def get_distribution(self, task_id: int) -> dict:
        task = self._require_finished_task(task_id)
        with self._db.connect() as conn:
            cached = tasks_repo.get_char_distribution_cache(conn, task_id)
        if cached is not None:
            return {
                "task_id": task_id,
                "letters": cached["letters"],
                "digits": cached["digits"],
            }

        result = self._compute_distribution(task)
        self._save_distribution(result)
        return result

    def cache_distribution(self, task_id: int) -> dict:
        task = self._require_finished_task(task_id)
        result = self._compute_distribution(task)
        self._save_distribution(result)
        return result

    def _require_finished_task(self, task_id: int) -> dict:
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
        return task

    def _compute_distribution(self, task: dict) -> dict:
        letters: dict[str, int] = {}
        digits: dict[str, int] = {}

        output_folder = Path(task["output_folder_path"])
        for csv_path in output_folder.rglob("*_labels.csv"):
            _accumulate(csv_path, letters, digits)

        return {
            "task_id": task["id"],
            "letters": letters,
            "digits": digits,
        }

    def _save_distribution(self, result: dict) -> None:
        with self._db.connect() as conn:
            tasks_repo.save_char_distribution_cache(
                conn,
                result["task_id"],
                letters=result["letters"],
                digits=result["digits"],
            )


def _accumulate(
    csv_path: Path,
    letters: dict[str, int],
    digits: dict[str, int],
) -> None:
    try:
        with csv_path.open(encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                for char in row.get("ocr_result", ""):
                    if "A" <= char <= "Z":
                        letters[char] = letters.get(char, 0) + 1
                    elif "0" <= char <= "9":
                        digits[char] = digits.get(char, 0) + 1
    except Exception as exc:
        raise ApiError(
            "INTERNAL_SERVER_ERROR",
            f"Failed to parse label CSV: {csv_path.name}",
            status_code=500,
        ) from exc
