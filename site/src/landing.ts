import { detectLocale, direction, formatText, isLocale, languageNames, localePath, type Locale } from './locale';
import type { LandingCopy } from './i18n';

const root = document.querySelector<HTMLElement>('[data-landing]');
if (root) initializeLanding(root);

function initializeLanding(root: HTMLElement) {
  const locale = root.dataset.locale;
  if (!locale || !isLocale(locale)) return;
  const base = root.dataset.siteBase || '/';
  const { demo: copy, common, tools } = JSON.parse(root.dataset.copy!) as Pick<LandingCopy, 'demo' | 'common' | 'tools'>;
  const samples = JSON.parse(root.dataset.samples!) as Record<Locale, LandingCopy['sample']>;
  const query = <T extends Element>(selector: string) => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing landing element: ${selector}`);
    return element;
  };
  const navigate = (target: Locale) => { window.location.href = localePath(target, base); };
  const localeSelect = query<HTMLSelectElement>('[data-locale-select]');
  localeSelect.addEventListener('change', () => {
    if (isLocale(localeSelect.value)) navigate(localeSelect.value);
  });

  const detectedLocale = detectLocale(navigator.languages.length ? navigator.languages : [navigator.language]);
  const prompt = query<HTMLElement>('[data-locale-prompt]');
  const promptToggle = query<HTMLButtonElement>('[data-locale-prompt-toggle]');
  const dismissalKey = 'skillbridge-locale-prompt-dismissed';
  let dismissed = false;
  // Storage can be blocked; locale switching and the demo must still work.
  try { dismissed = sessionStorage.getItem(dismissalKey) === '1'; } catch { /* optional preference */ }
  if (detectedLocale !== locale && !dismissed) {
    const values = { language: languageNames[detectedLocale] };
    query<HTMLElement>('[data-locale-prompt-text]').textContent = formatText(common.localePrompt, values);
    promptToggle.textContent = formatText(common.viewIn, values);
    prompt.hidden = false;
    try { sessionStorage.setItem(dismissalKey, '1'); } catch { /* optional preference */ }
  }
  promptToggle.addEventListener('click', () => navigate(detectedLocale));

  const demo = query<HTMLElement>('[data-extension-demo]');
  const sidebar = query<HTMLElement>('[data-extension-sidebar]');
  const sidebarToggle = query<HTMLButtonElement>('[data-sidebar-toggle]');
  const sidebarClose = query<HTMLButtonElement>('[data-sidebar-close]');
  const toolsToggle = query<HTMLButtonElement>('[data-tools-toggle]');
  const toolsMenu = query<HTMLElement>('[data-tools-menu]');
  const language = query<HTMLSelectElement>('[data-popup-language]');
  const autoTranslate = query<HTMLInputElement>('[data-auto-translate]');
  const commentTranslate = query<HTMLInputElement>('[data-comment-translate]');
  const status = query<HTMLElement>('[data-extension-status]');
  const demoQuestion = query<HTMLButtonElement>('[data-demo-question]');
  const chatInput = query<HTMLTextAreaElement>('[data-chat-input]');
  const chatFeedback = query<HTMLElement>('[data-chat-feedback]');
  const tutorMessage = query<HTMLElement>('[data-tutor-message]');
  const toolButtons = root.querySelectorAll<HTMLButtonElement>('[data-tool-preview]');
  const previewTitle = query<HTMLElement>('[data-preview-title]');
  const previewBody = query<HTMLElement>('[data-preview-body]');
  const rail = root.querySelectorAll<HTMLButtonElement>('[data-flow-step]');

  const updateTranslationPreview = (code: Locale) => {
    query<HTMLElement>('[data-preview-label]').textContent = formatText(common.previewLabel, { language: languageNames[code] });
    previewTitle.textContent = samples[code].title;
    previewBody.textContent = samples[code].body;
    for (const element of [previewTitle, previewBody]) {
      element.lang = code;
      element.dir = direction(code);
    }
  };
  const setRail = (step: string) => rail.forEach((button) => {
    const active = button.dataset.flowStep === step;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'step' : 'false');
  });
  const setSidebar = (open: boolean, moveFocus = false) => {
    if (!open) {
      toolsMenu.hidden = true;
      toolsToggle.setAttribute('aria-expanded', 'false');
    }
    sidebar.hidden = !open;
    sidebarToggle.setAttribute('aria-expanded', String(open));
    demo.dataset.mode = open ? 'sidebar' : 'popup';
    setRail(open ? 'sidebar' : 'popup');
    if (moveFocus) (open ? sidebarClose : sidebarToggle).focus();
  };
  sidebarToggle.addEventListener('click', () => setSidebar(sidebar.hidden !== false, true));
  sidebarClose.addEventListener('click', () => setSidebar(false, true));
  toolsToggle.addEventListener('click', () => {
    toolsMenu.hidden = !toolsMenu.hidden;
    toolsToggle.setAttribute('aria-expanded', String(!toolsMenu.hidden));
  });
  language.addEventListener('change', () => {
    if (!isLocale(language.value)) return;
    updateTranslationPreview(language.value);
    demo.dataset.mode = 'language';
    setRail('language');
    status.textContent = formatText(copy.languageSet, { language: languageNames[language.value] });
  });
  autoTranslate.addEventListener('change', () => { status.textContent = autoTranslate.checked ? copy.autoOn : copy.autoOff; });
  commentTranslate.addEventListener('change', () => { status.textContent = commentTranslate.checked ? copy.commentsOn : copy.commentsOff; });
  const showChatPreview = () => {
    if (!chatInput.value.trim()) chatInput.value = copy.askPassage;
    chatFeedback.textContent = copy.chatReady;
  };
  toolButtons.forEach((button) => button.addEventListener('click', () => {
    const tool = button.dataset.toolPreview as keyof typeof tools;
    if (!Object.hasOwn(tools, tool)) return;
    toolButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    tutorMessage.textContent = tools[tool];
    chatFeedback.textContent = copy.toolDisclosure;
    toolsMenu.hidden = true;
    toolsToggle.setAttribute('aria-expanded', 'false');
    toolsToggle.focus();
  }));
  demoQuestion.addEventListener('click', () => {
    chatInput.value = copy.askPassage;
    chatInput.focus();
  });
  query<HTMLButtonElement>('[data-chat-send]').addEventListener('click', showChatPreview);
  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      showChatPreview();
    }
  });
  rail.forEach((button) => button.addEventListener('click', () => {
    const step = button.dataset.flowStep!;
    if (step === 'sidebar') setSidebar(true, true);
    else {
      setSidebar(false);
      demo.dataset.mode = step;
      setRail(step);
      if (step === 'language') language.focus();
    }
  }));
  demo.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!toolsMenu.hidden) {
      toolsMenu.hidden = true;
      toolsToggle.setAttribute('aria-expanded', 'false');
      toolsToggle.focus();
    } else if (!sidebar.hidden) setSidebar(false, true);
  });
  updateTranslationPreview(locale);
}
