# 배경색 분포 모듈 설계 명세

## 1. 목적

증강 작업에서 성공적으로 처리된 원본 이미지의 배경색 분포를 on-demand로 분석한다. 각 원본 이미지의 배경 픽셀 평균 RGB를 구해 11개 대표색 중 1개를 선택하고, 이미지 단위 비율(%)을 반환한다.

## 2. 핵심 결정사항

- 분석 대상은 증강 이미지가 아닌 **원본 이미지**다. 셔플은 글자 위치만 바꾸고 배경은 변경하지 않으므로 원본 분석으로 충분하다.
- 성공한 원본 이미지만 포함한다. 성공 여부는 task output 폴더의 `*_labels.csv` 존재 여부로 판단한다.
- 원본 이미지의 배경 분포는 해당 이미지에서 생성된 variant 수(N)로 가중하여 평균한다. variant가 많이 생성된 원본일수록 결과에 더 많이 반영된다.
- 배경 픽셀 분리는 Otsu 이진화를 사용한다. `shuffle.py`의 `_make_global_mask`를 재활용하며 CRAFT 재실행 없이 처리한다.
- 배경 픽셀 전체의 평균 RGB를 구한 뒤, RGB 유클리드 거리 기준으로 11개 대표색 중 가장 가까운 색 1개를 해당 이미지의 대표색으로 선택한다.
- 픽셀 하나하나를 분류하지 않고 이미지당 대표색 1개만 선택하므로 처리가 빠르다.
- 결과는 DB에 저장하지 않고 API 호출 시점에 계산한다 (on-demand).

## 3. 대표색 정의

11개 기본 색상과 기준 RGB:

| 색상 | 영문 키 | RGB |
|---|---|---|
| 빨강 | `red` | (255, 0, 0) |
| 주황 | `orange` | (255, 165, 0) |
| 노랑 | `yellow` | (255, 255, 0) |
| 초록 | `green` | (0, 128, 0) |
| 파랑 | `blue` | (0, 0, 255) |
| 보라 | `purple` | (128, 0, 128) |
| 분홍 | `pink` | (255, 192, 203) |
| 갈색 | `brown` | (165, 42, 42) |
| 흰색 | `white` | (255, 255, 255) |
| 회색 | `gray` | (128, 128, 128) |
| 검정 | `black` | (0, 0, 0) |

배경 픽셀 전체의 평균 RGB를 구한 뒤, 각 대표색 RGB와의 유클리드 거리를 계산해 가장 가까운 색 1개를 선택한다.

```python
import math

# 배경 픽셀 평균 RGB
avg_r, avg_g, avg_b = bg_pixels.mean(axis=0).astype(int)

# 가장 가까운 대표색 선택
def classify(r: int, g: int, b: int) -> str:
    return min(REPRESENTATIVE_COLORS, key=lambda name: math.dist((r, g, b), REPRESENTATIVE_COLORS[name]))
```

## 4. 모듈 구조

```
backend/app/
├── services/
│   └── bg_color_distribution_service.py   # 배경색 분석 로직
├── schemas/
│   └── bg_color_distribution.py           # Pydantic 응답 모델
└── api/routes/
    └── augmentation_tasks.py              # 기존 파일에 새 엔드포인트 추가
```

### 4.1 DI 등록

`app/main.py`에서 `BgColorDistributionService` 인스턴스를 생성해 `app.state.bg_color_distribution_service`에 등록한다.

```python
def get_bg_color_distribution_service(request: Request) -> BgColorDistributionService:
    return request.app.state.bg_color_distribution_service
```

## 5. API 명세

### GET `/api/augmentation-tasks/{taskId}/bg-color-distribution`

지정 task에서 성공한 원본 이미지들의 배경색 분포를 반환한다.

#### 상태 규칙

- `DONE`, `STOPPED`, `FAILED` 상태에서만 조회 가능하다.
- `PENDING`, `RUNNING` 상태이면 `409 TASK_NOT_FINISHED`를 반환한다.

#### Response `200`

```json
{
  "taskId": 10,
  "analyzedImageCount": 3,
  "distribution": {
    "red":    0.0,
    "orange": 0.0,
    "yellow": 0.0,
    "green":  0.0,
    "blue":   0.0,
    "purple": 0.0,
    "pink":   0.0,
    "brown":  0.0,
    "white":  33.33,
    "gray":   66.67,
    "black":  0.0
  }
}
```

- `analyzedImageCount`: 분석에 포함된 원본 이미지 수 (성공한 이미지만)
- `distribution`: 11개 대표색 각각의 비율(%). 이미지 단위로 집계하며 합계는 100%.
  - 예: gray 2장(N=3), white 1장(N=1) → gray 75%, white 25%

#### 에러

| Code | HTTP status | 의미 |
|---|---|---|
| `TASK_NOT_FOUND` | `404` | 작업 없음 |
| `TASK_NOT_FINISHED` | `409` | 작업이 완료 상태가 아님 |
| `INTERNAL_SERVER_ERROR` | `500` | 이미지 처리 실패 등 서버 오류 |

## 6. 서비스 설계

### BgColorDistributionService

```python
class BgColorDistributionService:
    def __init__(self, db: PostgresDatabase) -> None:
        self._db = db

    def get_distribution(self, task_id: int) -> dict:
        ...
```

#### 처리 흐름

1. DB에서 `task_id`로 `status`, `output_folder_path`, `project_id`를 조회한다.
2. `status`가 `PENDING` 또는 `RUNNING`이면 `409 TASK_NOT_FINISHED`를 raise한다.
3. DB에서 `project_id`로 `source_folder_path`를 조회한다.
4. `output_folder_path` 하위에서 `*_labels.csv`를 재귀 탐색한다.
5. 각 CSV에서:
   - stem으로 `source_folder_path` 내 원본 이미지 파일을 찾는다 (jpg/png/jpeg 등 확장자 탐색).
   - CSV 데이터 행 수를 N으로 취한다 (header 제외).
   - 원본 이미지에 Otsu 이진화를 적용해 배경 픽셀을 추출한다.
   - 배경 픽셀 전체의 평균 RGB를 구한다.
   - 평균 RGB와 가장 가까운 대표색 1개를 선택한다.
   - 해당 대표색에 N을 누적한다.
6. 전체 가중치 합으로 나눠 최종 비율을 계산한다.
7. `analyzedImageCount`와 `distribution`을 반환한다.

#### 가중 평균 계산 예시

```
원본A (대표색=gray): N=3 → weighted["gray"] += 3
원본B (대표색=white): N=1 → weighted["white"] += 1
total_weight = 4

gray  = 3/4 × 100 = 75.0%
white = 1/4 × 100 = 25.0%
```

#### 원본 이미지 탐색

label CSV의 stem(`001_labels.csv` → stem=`001`)으로 `source_folder_path`에서 원본 파일을 찾는다. 지원 확장자: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.tiff`.

```python
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff"}

def find_source_image(source_folder: Path, stem: str) -> Path | None:
    for ext in IMAGE_EXTENSIONS:
        candidate = source_folder / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    return None
```

단, label CSV가 output 폴더의 하위 디렉터리에 있을 경우 원본 이미지도 동일한 상대 경로로 탐색한다.

#### Otsu 배경 마스크 및 대표색 선택

`shuffle.py`의 `_make_global_mask`를 그대로 재사용한다.

```python
from app.augmentation.shuffle import _make_global_mask

mask = _make_global_mask(image)      # mask==0: 배경, mask==255: 글자
bg_pixels = img_arr[mask_arr == 0]   # 배경 픽셀만 추출
avg_r, avg_g, avg_b = bg_pixels.mean(axis=0).astype(int)  # 평균 RGB
representative = classify(avg_r, avg_g, avg_b)             # 대표색 1개 선택
```

## 7. 스키마 설계

```python
# schemas/bg_color_distribution.py

class BgColorDistributionResponse(CamelModel):
    task_id: int
    analyzed_image_count: int
    distribution: dict[str, float]   # {"red": 0.5, "gray": 38.1, ...}
```

## 8. 구현 순서

1. `schemas/bg_color_distribution.py` 작성
2. `services/bg_color_distribution_service.py` 작성
3. `app/main.py`에 `BgColorDistributionService` DI 등록
4. `api/routes/augmentation_tasks.py`에 엔드포인트 추가

## 9. 다음 단계로 미룰 기능

- 분포 결과 DB 캐싱
- HSV/LAB 색공간 기반 분류 (더 정확한 색 인식)
- 대표색 수 파라미터화 (K-means 방식)
- 썸네일 다운샘플링으로 처리 속도 최적화
- 하위 폴더 구조 원본 이미지 탐색 지원
