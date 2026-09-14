<div align="center">

<img src="assets/icons/icon128.png" alt="SkillBridge" width="80" />

# SkillBridge — AI Course Translator

> **Source checkpoint:** <!-- VERSION_START -->v4.2.0<!-- VERSION_END --> — GitHub source release. The Chrome Web Store still serves legacy v1.0.1; publication of the current source build is paused.

[Landing page](https://heznpc.github.io/skillBridge/) · [Install](#install) · [Report a bug](https://github.com/heznpc/skillbridge/issues)

[![CI](https://github.com/heznpc/skillbridge/actions/workflows/ci.yml/badge.svg)](https://github.com/heznpc/skillbridge/actions/workflows/ci.yml) [![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) [![Chrome MV3](https://img.shields.io/badge/Chrome-Extension_MV3-blue.svg)](https://developer.chrome.com/docs/extensions/)

**Read supported AI courses in the language that lets you focus on the idea.**

SkillBridge translates supported Anthropic Skilljar courses, Claude Academy course routes, and Claude tutorial pages in place. Curated terminology, local study tools, and assessment safeguards stay with the lesson.

<!-- LANG_COUNT_START -->32 languages<!-- LANG_COUNT_END --> are available. Translation and local tools require no account or API key. The optional Tutor uses a separate Puter sign-in.

</div>

---

## What it does

- **Translate in place** — headings, body copy, navigation, comments, and supported subtitles change without moving to another tab.
- **Protect technical language** — Premium dictionaries preserve brand names and AI terminology before and after machine translation.
- **Keep study context** — bookmarks, notes, flashcards, progress, recent lessons, outline, and PDF export stay in the browser.
- **Respect assessments** — quiz answer choices are left alone; recognized proctored certification routes disable the extension.
- **Work across tabs** — shared background storage preserves independent bookmark, note, and translation-feedback edits instead of letting a stale tab overwrite them.

### Feedback and corrections

Reports can save a selected source/translation pair locally. **Review correction** lets you edit a suggestion, apply it to an exact source-and-language match, and revert it later. Applying a suggestion is explicit; saving a report does not change future translations automatically.

### Tutor boundary

Tutor is optional and context-aware. It opens beside a lesson, never inside recognized course quizzes or certification exams. Only the active question and disclosed lesson context are sent to the selected Tutor runtime; saved history is local.

## Install

### Chrome, Edge, or another Chromium browser

The current source checkpoint is installed as an unpacked extension while CWS publication is paused:

```bash
git clone https://github.com/heznpc/skillbridge.git
cd skillbridge
npm ci
npm run build:bundle
```

1. Open `chrome://extensions/` or `edge://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select `dist/bundled`.

The live CWS listing still installs v1.0.1. It is not the current source checkpoint.

### Firefox

Firefox support is beta. Use the repository’s development build and load the generated extension from `dist/` through `about:debugging`.

## Supported courses and languages

SkillBridge currently targets `anthropic.skilljar.com`, detected Skilljar-hosted Anthropic courses, `academy.claude.com/courses`, and `claude.com/resources/tutorials`. Non-AI Skilljar tenants and assessment routes are paused automatically.

Premium languages use curated dictionaries plus Google Translate; other supported languages use Google Translate with protected-term restoration. The table below is generated from each dictionary’s metadata.

<!-- LOCALE_QA_START -->
| Language | Code | Entries | Last curated | Last LLM audit | Native review |
|---|---|---:|---|---|---|
| 한국어 | `ko` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 日本語 | `ja` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 中文(简体) | `zh-CN` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| 中文(繁體) | `zh-TW` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Español | `es` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Français | `fr` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Italiano | `it` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Nederlands | `nl` | 1130 | 2026-09-01 | 2026-09-01 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Deutsch | `de` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Português (BR) | `pt-BR` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Русский | `ru` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Tiếng Việt | `vi` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
| Bahasa Indonesia | `id` | 1130 | 2026-07-28 | 2026-07-28 | 🙋 [recruiting](https://github.com/heznpc/skillBridge/issues/202) |
<!-- LOCALE_QA_END -->

## Privacy and limits

- Translation results, notes, bookmarks, feedback, and Tutor history stay in browser storage unless an explicit cloud Tutor request is made.
- No telemetry or automatic GitHub issue is created from translation feedback.
- Cached translations cover text already encountered; the course page and media are not copied into a navigable offline course.
- Detection is pattern-based. For any proctored exam, turn the extension off yourself even if a route is not recognized.
- The current source checkpoint has automated Academy routing and Tutor transport coverage. An authenticated live Academy post-submit capture and final signed-in Tutor round trip remain release gates.

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the version split between the source checkpoint and the live CWS package.

## Development

```bash
npm ci
npm test                 # unit and integration tests
npm run test:e2e         # Playwright end-to-end suite
npm run typecheck        # JavaScript boundary checks
npm run lint
npm run docs             # metadata + landing build + docs publish
```

The landing page lives in `site/` (Astro). Extension runtime code is under `src/`; tests are under `tests/`. Keep generated `docs/` output in sync with `npm run docs` before opening a pull request.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), open an issue for a bug or language gap, and include a reproducible course URL when possible. Do not include private lesson data, account credentials, or learner-identifying information in reports.

## License

MIT. See [LICENSE](LICENSE).
