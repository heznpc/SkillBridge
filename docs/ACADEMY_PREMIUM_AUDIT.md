# Academy 공식 번역과 Premium 사전 대조

검사일: 2026-09-14

로그인된 `academy.claude.com/ko/` 화면에서 확인한 공식 표기는 `Claude 아카데미`, `AI의 역량과 한계`, `코스 퀴즈`, `다음 단계`였습니다. 기존 Premium 사전은 Skilljar의 `Anthropic Academy`와 Academy의 브랜드를 같은 항목으로 취급할 수 있었고, 영어 키 `Claude Academy`도 없었습니다.

이번 보수에서 `Claude Academy`를 모든 Premium 로케일에 추가하고, 한국어는 공식 화면과 동일한 `Claude 아카데미`로 고정했습니다. 기존 `Anthropic Academy` 값은 Skilljar 표면을 위해 유지했습니다. 따라서 두 플랫폼의 브랜드가 서로 덮어쓰이지 않습니다.

| 항목 | 결과 |
| --- | --- |
| Academy 공식 언어 선택기 | 영어, 독일어, 스페인어, 프랑스어, 일본어, 한국어, 중국어 간체/번체 확인 |
| Skilljar 공식 언어 선택기 | 공개 카탈로그에서 확인되지 않음 |
| Academy 코스 제목 76개와 Premium 사전 | 기존 사전에 75개가 없었음. 현재는 제목 전체를 일괄 추가하지 않고, 공식 번역 덮어쓰기 위험이 없는 범위만 고정 |
| 의미 품질 검토 | 브랜드 표기 1건을 수정·회귀 테스트. 나머지 75개 제목과 본문은 원어민 검토가 필요해 미완료 |

`scripts/check-academy-localization.js`는 공식 사이트의 표면별 번역 범위를 측정하는 도구이며, 의미 품질을 판정하지 않습니다. 원어민 검토가 끝나기 전까지 Academy 공식 문구를 기계 번역으로 재번역하지 않는 정책을 유지합니다.
