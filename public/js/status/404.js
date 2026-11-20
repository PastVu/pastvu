/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

const root = document.documentElement;
const ufo = document.querySelector('.ufo');

if (ufo) {
    const bounds = ufo.getBoundingClientRect();
    const initialLeft = bounds.left + window.scrollX;
    const initialTop = bounds.top + window.scrollY;
    const centerX = (root.clientWidth - bounds.width) / 2;
    const centerY = (root.clientHeight - bounds.height) / 2;

    root.addEventListener('mousemove', event => {
        ufo.style.left = `${initialLeft + (event.pageY - centerY) * 0.6}px`;
        ufo.style.top = `${initialTop + (event.pageX - centerX) * 0.2}px`;
    });
}
