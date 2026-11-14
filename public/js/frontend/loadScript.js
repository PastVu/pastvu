/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const scripts = new Map();
let nextCallback = 0;

export function loadScript(url, { callback = false } = {}) {
    if (!scripts.has(url)) {
        scripts.set(url, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const name = '_pastvuScript' + nextCallback++;
            const cleanup = () => { delete window[name]; };

            if (callback) {
                window[name] = () => { cleanup(); resolve(); };
                script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + name;
            } else {
                script.src = url;
                script.onload = () => resolve();
            }

            script.onerror = () => {
                cleanup();
                scripts.delete(url);
                reject(new Error('Unable to load script: ' + url));
            };
            document.head.appendChild(script);
        }));
    }

    return scripts.get(url);
}
