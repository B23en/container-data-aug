# 증강 결과 분포 통합 질의응답 요약

## 결정 사항

- 통합 범위는 기존 `char-distribution`, `bg-color-distribution` API를 유지하면서 결과 화면에 시각화하는 방식으로 정했다.
- 결과 화면은 먼저 기본 증강 요약을 보여주고, 문자 분포와 배경색 분포 패널은 독립적으로 비동기 로딩한다.
- 문자 분포는 A-Z와 0-9 전체 슬롯을 보여주며, API 응답은 기존 count-only shape를 유지한다.
- 배경색 분포는 11개 대표색 전체를 영문 key와 swatch, percentage bar로 보여준다.
- 프로젝트 상세에서는 최근 작업이 `DONE`일 때만 결과 화면 재열기 버튼을 제공한다.
- 백엔드 distribution API는 기존 호환성을 유지해 `DONE`, `STOPPED`, `FAILED` terminal 상태에서 조회 가능하게 둔다.
- 배경색 분석은 원본 이미지를 분석하고 생성 variant 수로 가중하는 기존 설계를 유지한다.

## 캐싱 정책

- 분포 결과는 `augmentation_tasks` row에 nullable JSONB 컬럼으로 저장한다.
- `DONE` 직후 runner가 자동 계산과 저장을 시도한다.
- 자동 캐시 생성 실패는 증강 task의 `DONE` 상태를 깨지 않는다.
- 캐시가 없는 상태에서 distribution API가 호출되면 재계산 후 저장하고 응답한다.
- `computedAt`이나 `cacheHit` 같은 캐시 메타데이터는 public API 응답에 포함하지 않는다.

## UI 정책

- shadcn 스타일의 작은 `Card`, `Badge`, `Skeleton` 컴포넌트를 추가해 결과 화면을 정리한다.
- 문자/배경색 패널은 각각 loading, empty, error, retry 상태를 가진다.
- 빈 결과는 패널을 숨기지 않고 “분석 가능한 결과가 없음” 상태로 표시한다.
