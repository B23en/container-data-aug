# 글자 수 분포 모듈 설계 명세

## 1. 목적

증강 작업이 완료된 후, 생성된 증강 이미지 전체에서 영문자(A–Z)와 숫자(0–9) 각각의 출현 횟수를 집계하는 on-demand API 모듈을 정의한다.

## 2. 핵심 결정사항

- 글자 수 분포는 DB에 저장하지 않는다. API 호출 시점에 label CSV를 파싱해 계산한다.
- 데이터 소스는 `shuffle.py`가 출력 폴더에 생성한 `{stem}_labels.csv`의 `ocr_result` 컬럼이다. OCR을 재실행하지 않는다.
- 집계 단위는 variant 전체다. 원본 이미지 1장에서 N개의 variant가 생성되면 각 variant의 `ocr_result`를 모두 더한다. 동일 원본의 variant는 글자 구성이 같으므로 N배로 누적된다.
- 영문자와 숫자를 별도 딕셔너리로 분리해 반환한다.
- 이 기능은 기존 result 엔드포인트와 분리된 독립 엔드포인트로 제공한다.

## 3. 모듈 구조

```
backend/app/
├── services/
│   └── char_distribution_service.py   # CSV 파싱 및 글자 카운팅 로직
├── schemas/
│   └── char_distribution.py           # Pydantic 응답 모델
└── api/routes/
    └── augmentation_tasks.py          # 기존 파일에 새 엔드포인트 추가
```

### 3.1 DI 등록

`app/main.py`의 `lifespan` 또는 startup 훅에서 `CharDistributionService` 인스턴스를 생성해 `app.state.char_distribution_service`에 등록한다.

라우터에서는 FastAPI `Depends()`를 통해 주입한다.

```python
def get_char_distribution_service(request: Request) -> CharDistributionService:
    return request.app.state.char_distribution_service
```

## 4. API 명세

### GET `/api/augmentation-tasks/{taskId}/char-distribution`

지정 작업의 증강 이미지 전체에 대한 글자 수 분포를 반환한다.

#### 상태 규칙

- `DONE`, `STOPPED`, `FAILED` 상태에서만 조회 가능하다.
- `PENDING`, `RUNNING` 상태이면 `409 TASK_NOT_FINISHED`를 반환한다.

#### Response `200`

```json
{
  "taskId": 10,
  "letters": {
    "M": 5,
    "S": 5,
    "C": 5,
    "U": 5
  },
  "digits": {
    "1": 5,
    "2": 5,
    "3": 5,
    "4": 5,
    "5": 5,
    "6": 5,
    "7": 5
  }
}
```

- `letters`: 영문 대문자 A–Z 중 출현한 문자만 포함. 미출현 문자는 생략한다.
- `digits`: 숫자 0–9 중 출현한 문자만 포함. 미출현 숫자는 생략한다.

#### 에러

| Code | HTTP status | 의미 |
|---|---|---|
| `TASK_NOT_FOUND` | `404` | 작업 없음 |
| `TASK_NOT_FINISHED` | `409` | 작업이 완료 상태가 아님 |
| `INTERNAL_SERVER_ERROR` | `500` | CSV 파싱 실패 등 서버 오류 |

## 5. 서비스 설계

### CharDistributionService

생성자에서 외부 의존성을 주입받는다. MVP에서는 DB 연결(`PostgresDatabase`)만 필요하다.

```python
class CharDistributionService:
    def __init__(self, db: PostgresDatabase) -> None:
        self._db = db

    async def get_distribution(self, task_id: int) -> CharDistributionResponse:
        ...
```

#### 처리 흐름

1. DB에서 `task_id`로 `output_folder_path`와 `status`를 조회한다.
2. `status`가 `PENDING` 또는 `RUNNING`이면 `409 TASK_NOT_FINISHED`를 raise한다.
3. `output_folder_path` 하위에서 `*_labels.csv` 파일을 재귀 탐색한다.
4. 각 CSV의 `ocr_result` 컬럼을 읽어 문자별 카운트를 누적한다.
5. 누적 결과를 `letters`(A–Z)와 `digits`(0–9)로 분리해 반환한다.

#### 글자 분류 기준

```python
import re

for char in ocr_result:
    if re.match(r'[A-Z]', char):
        letters[char] += 1
    elif re.match(r'[0-9]', char):
        digits[char] += 1
    # 그 외 문자는 무시
```

`ocr_result`는 `shuffle.py`가 생성한 11자리 ISO 6346 코드 기준이므로 대문자 영문자와 숫자만 포함된다.

## 6. 스키마 설계

```python
# schemas/char_distribution.py

class CharDistributionResponse(CamelModel):
    task_id: int
    letters: dict[str, int]   # {"M": 5, "S": 5, ...}
    digits: dict[str, int]    # {"1": 5, "2": 5, ...}
```

`CamelModel`을 상속하므로 응답 JSON은 자동으로 camelCase로 직렬화된다.

## 7. CSV 포맷 참고

`shuffle.py`가 생성하는 label CSV 형식:

```csv
filename,ocr_result,0,1,2,3,4,5,6,7,8,9,10
001_1.jpg,SMCU1234567,1,0,2,3,4,5,6,7,8,9,10
001_2.jpg,CMSU1234567,2,1,0,3,4,5,6,7,8,9,10
```

- `filename`: 증강 이미지 파일명
- `ocr_result`: 증강 이미지의 문자 배열 (셔플 결과 반영)
- 나머지 컬럼: 원본 인덱스 매핑 (글자 수 분포 계산에는 사용하지 않음)

셔플은 글자의 위치만 바꾸므로, 동일 원본 이미지의 모든 variant는 같은 문자 구성을 가진다. N개 variant 생성 시 각 문자 출현 횟수는 원본 대비 N배가 된다.

## 8. 구현 순서

1. `schemas/char_distribution.py` 작성
2. `services/char_distribution_service.py` 작성
3. `app/main.py`에 `CharDistributionService` DI 등록
4. `api/routes/augmentation_tasks.py`에 엔드포인트 추가

## 9. 다음 단계로 미룰 기능

- 분포 결과 DB 캐싱 (작업 완료 시 자동 저장 후 재계산 생략)
- 소문자 처리 (현재 runner는 대문자만 생성)
- 특수문자 포함 여부 집계
- 프로젝트 단위 누적 분포 조회
