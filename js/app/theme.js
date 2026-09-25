// Tema claro / oscuro

import { dom } from './dom.js';
import { state } from './state.js';

const THEME_KEY = 'theme_preference';

function applyTheme(theme) {
    const light = theme === 'light';
    document.body.classList.toggle('light-theme', light);
    dom.darkIcon.style.display = light ? 'none' : 'block';
    dom.lightIcon.style.display = light ? 'block' : 'none';
}

export function initTheme() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
    dom.btnThemeToggle.addEventListener('click', () => {
        const next = document.body.classList.contains('light-theme') ? 'dark' : 'light';
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
        if (state.canvas) state.canvas.render();
    });
}
