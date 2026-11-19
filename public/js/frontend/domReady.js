/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

export default await new Promise(resolve => {
    if (document.readyState !== 'loading') {
        resolve(document);
    } else {
        document.addEventListener('DOMContentLoaded', () => resolve(document), { once: true });
    }
});
