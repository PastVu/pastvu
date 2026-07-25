/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { ActionLog } from '../models/ActionLog';

export const OBJTYPES = {
    USER: 1,
    PHOTO: 2,
    COMMENT: 3,
};
export const TYPES = {
    CREATE: 1,
    RESTORE: 8,
    REMOVE: 9,
};

export async function logIt(user, obj, objtype, type, stamp, reason, roleregion, addinfo) {
    const action = new ActionLog({
        user,
        stamp,
        obj,
        objtype,
        type,
        reason,
        role: user.role,
        roleregion,
        addinfo,
    });

    return action.save();
}
