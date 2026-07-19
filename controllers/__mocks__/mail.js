/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import { jest } from '@jest/globals';

// Mock mailing setup and sending functions.
export const send = jest.fn().mockResolvedValue();
export const ready = jest.fn().mockResolvedValue();
