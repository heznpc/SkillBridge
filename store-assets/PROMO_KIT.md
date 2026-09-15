# Archived / frozen SkillBridge v4.0.0 promotion kit — do not use

> **Frozen archive. Do not publish or upload this v4.0.0 copy, media, hashes, or
> dashboard fields.** Source v4.2.0 is a GitHub-only checkpoint, not a CWS
> submission candidate. Assign the final CWS version and regenerate its promo
> assets, copy, evidence, and dashboard fields only after the ongoing
> code-development phase is complete.

Status: **frozen historical v4.0.0 draft — not live; do not publish**

This historical kit was derived from the same `dist/bundled` artifact used for
the archived CWS candidate — the v4.0.0 build, which ships the AI Tutor. The
instructions and copy below are retained as evidence only and must not be used
for a current launch.

## Runtime and capture boundary

The unpacked v4.0.0 bundle was also exercised on the signed-in live Skilljar
site on 2026-07-24. Lesson translation, language switching, the tools menu, and
the learning dashboard worked while the host header remained unchanged.

The committed CWS screenshots and generated demo video are deterministic
artwork: they execute the real bundle against neutral local fixtures so they can
be rebuilt without a Skilljar login or third-party branding. They are not proof
of the live site's appearance. Local live-site debug captures are deliberately
excluded from Git and public publishing inputs.

## Positioning

**One line:** Learn supported AI courses in your language while keeping
technical terminology intact.

**Proof points:**

- 32 interface languages.
- Curated dictionaries for premium languages and protected-term restoration.
- Local progress, bookmarks, recent lessons, and spaced-repetition flashcards.
- Exam mode translates the question but leaves answer choices unchanged.
- The AI Tutor ships in the CWS bundle: Claude via the bundled Puter client
  (free Puter sign-in, no API key, no SkillBridge account).
- Optional on-device tutor engine: point it at your own OpenAI-compatible
  server (e.g. Ollama) and tutor text never leaves your machine. Or turn the
  tutor off and use translation only.

## Current capture evidence

Use the current take-a-repo candidate and its claim/check report. Translation
and restore, Japanese body/UI, Tutor interaction, record persistence, flashcard
grading and exam protection are exercised on neutral fixtures. This does not
verify live Academy, real Tutor response quality or every supported language.
See [the capture contract](../docs/development/capture-contract.md).

## Archived pre-launch copy — do not use

### Korean

SkillBridge v4.0.0 Chrome Web Store 후보를 준비했습니다.

지원되는 AI 강의를 32개 언어로 읽고, 기술 용어는 보호하며, 학습 현황과
플래시카드는 기기 안에서 관리합니다. 시험 모드에서는 질문만 번역하고 답안
선택지는 원문으로 유지합니다. AI 튜터는 이번 CWS 번들에 포함되며(무료 Puter
로그인 사용), 원한다면 Ollama 같은 내 컴퓨터의 서버로 돌리거나 완전히 끌 수
있습니다.

현재 최종 등록 전 검증 단계입니다.

### English

SkillBridge v4.0.0 is ready as a Chrome Web Store release candidate.

Translate supported AI courses across 32 languages, keep technical terms
intact, use local progress and flashcards, and leave quiz answers untranslated
in exam mode. The AI Tutor ships in this bundle (free Puter sign-in) and can
instead run fully on-device against your own local server, or be turned off.

Final listing review is still pending.

## Archived launch-line lock — do not use

Use this sentence only after the CWS listing visibly reports v4.0.0:

> SkillBridge v4.0.0 is now available on the Chrome Web Store.

Before that proof exists, retain the release-candidate wording above.

## Asset map

### Current review assets

`npm run promo:build` creates one isolated evidence candidate. The hero clip shows
lesson → translation → paragraph question → saved learning records. Translation,
Japanese UI, Tutor, persistence, review and exam protection have separate clips.
Screenshots, the existing promo template and listing copy are included in review.

Raw WebM and final H.264 MP4 hashes live in `runs/<id>/run.json`. Videos visibly
state fixture/frozen translation/Tutor stub use. The former title-card composite,
vertical derivative and `promo-media-manifest.json` are historical, not current
release evidence. No footage is publicly deployed until the user reviews it.

After approval, `npm run capture:apply` connects exact reviewed files to the
existing landing image and store paths. `capture:verify-assets` checks their
receipt; `release:preflight` also requires the matching current approved candidate.
