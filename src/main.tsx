import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { resetPageScroll } from './components/Sheet';
import { startAutoUpdate } from './lib/updates';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startAutoUpdate();

// iPhone：キーボードを閉じたあと、ページが上にずれたまま（画面の上が見切れる）になるのを戻す
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const a = document.activeElement;
    const typing = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    if (!typing) resetPageScroll();
  }, 100);
});
