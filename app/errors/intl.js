/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

export default {
    DENY: 'You do not have permission for this action',

    BAD_PARAMS: 'Invalid request parameters',

    SESSION_CAN_REGET_REGISTERED_ONLY: 'Failed to fetch users',
    SESSION_NO_HEADERS: 'Bad request - no header or user agent',
    SESSION_NOT_FOUND: 'Session not found',

    TIMEOUT: 'Request timed out',
    UNHANDLED_ERROR: 'A server error occurred',
    COUNTER_ERROR: 'A server error occurred',

    NOTICE: 'Notice',

    NOT_FOUND: 'Resource not found',
    NOT_FOUND_USER: 'User not found',
    NO_SUCH_METHOD: 'The requested method does not exist',
    NO_SUCH_RESOURCE: 'Resource not found',
    NO_SUCH_PHOTO: 'The requested photo does not exist or is not available',
    NO_SUCH_USER: 'The requested user does not exist',
    NO_SUCH_REGION: 'No such region',
    NO_SUCH_REGIONS: 'No such regions',
    NO_SUCH_NEWS: 'No such news entry',

    INPUT: 'Input error',
    INPUT_FIELD_REQUIRED: 'Required input field',
    INPUT_LOGIN_REQUIRED: 'Enter your username',
    INPUT_LOGIN_CONSTRAINT: 'Username must be 3 to 15 Latin characters, start with a letter, and end with a letter or digit. It may also contain digits, dot, underscore and hyphen.',
    INPUT_PASS_REQUIRED: 'Enter your password',
    INPUT_EMAIL_REQUIRED: 'Enter your e-mail address',

    AUTHENTICATION: 'Authentication error',
    AUTHENTICATION_REGISTRATION: 'Authentication error',
    AUTHENTICATION_PASSCHANGE: 'Password change failed',
    AUTHENTICATION_DOESNT_MATCH: 'Invalid login / password pair',
    AUTHENTICATION_MAX_ATTEMPTS: 'Your account is temporarily locked because of too many failed sign-in attempts',
    AUTHENTICATION_NOT_ALLOWED: 'This user is not allowed to sign in',
    AUTHENTICATION_PASS_WRONG: 'Incorrect password',
    AUTHENTICATION_CURRPASS_WRONG: 'Current password is incorrect',
    AUTHENTICATION_PASSWORDS_DONT_MATCH: 'Passwords do not match',
    AUTHENTICATION_USER_EXISTS: 'A user with this name is already registered',
    AUTHENTICATION_USER_DOESNT_EXISTS: 'No user exists with that login or e-mail',
    AUTHENTICATION_EMAIL_EXISTS: 'A user with this e-mail is already registered',
    AUTHENTICATION_KEY_DOESNT_EXISTS: 'The key you provided does not exist',

    PHOTO_CHANGED: 'Someone has changed the information on this page since you last reloaded it',
    PHOTO_NEED_REASON: 'A reason for the operation is required',
    PHOTO_NEED_COORD: 'The photo must have coordinates or be assigned to a region manually',
    PHOTO_NEED_TITLE: 'Photo title is required',
    PHOTO_ANOTHER_STATUS: 'The photo is already in a different status — please reload the page',
    PHOTO_YEARS_CONSTRAINT: 'Published photos must be dated approximately between 1826 and 2000.',
    PAINTING_YEARS_CONSTRAINT: 'Published images must be dated approximately between 100 BC and 1980.',
    PHOTO_CONVERT_PROCEEDING: 'You have already submitted a request and it is still running. Please try again later',

    REGION_PARENT_THE_SAME: 'You are trying to set the region as its own parent',
    REGION_PARENT_DOESNT_EXISTS: 'The specified parent region does not exist',
    REGION_NO_RELATIVES: 'Regions must not be nested in each other',
    REGION_PARENT_LOOP: 'You picked a parent that already has the current region among its parents',
    REGION_GEOJSON_PARSE: 'GeoJSON parse error',
    REGION_GEOJSON_GEOMETRY: 'Invalid GeoJSON geometry',
    REGION_MAX_LEVEL: 'Region depth exceeds the maximum of 6',
    REGION_MOVE_EXCEED_MAX_LEVEL: 'After this move the region or its descendants would exceed the maximum depth of 6',
    REGION_SAVED_BUT_INCL_PHOTO: 'Saved, but an error occurred while recomputing contained photos',
    REGION_SAVED_BUT_PARENT_EXTERNALITY: 'Saved, but an error occurred while recomputing parent relationships',
    REGION_SAVED_BUT_REFILL_CACHE: 'Saved, but an error occurred while rebuilding the region cache. A server restart is recommended',
    REGION_SELECT_LIMIT: 'You can select up to 10 regions',

    COMMENT_NO_OBJECT: 'The commented object does not exist or is in a mode you cannot access',
    COMMENT_NOT_ALLOWED: 'Comment operations are disabled on this page',
    COMMENT_DOESNT_EXISTS: 'Comment does not exist',
    COMMENT_WRONG_PARENT: 'Something is wrong with the parent comment — it may have been deleted. Please reload the page',
    COMMENT_TOO_LONG: 'Comment exceeds the maximum length (12000)',
    COMMENT_UNKNOWN_USER: 'Unknown user in comments',

    ADMIN_CANT_CHANGE_HIS_ROLE: 'An administrator cannot change their own role :)',
    ADMIN_SUPER_CANT_BE_ASSIGNED: 'Super-administrator cannot be assigned through the user-management UI',
    ADMIN_ONLY_SUPER_CAN_ASSIGN: 'Only a super-administrator can assign administrators',

    CONVERT_PHOTOS_ALL: 'Failed to submit for conversion',
    CONVERT_PROMISE_GENERATOR: 'Conversion pipeline operation failed',

    SETTING_DOESNT_EXISTS: 'No such setting',

    MAIL_SEND: 'Failed to send e-mail',
    MAIL_WRONG: 'Invalid e-mail format, please check again',
    MAIL_IN_USE: 'This e-mail is already in use by another user',
};
