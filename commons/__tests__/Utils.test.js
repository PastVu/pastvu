/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import Utils from '../Utils';
import config from '../../config';

const origin = config.client.origin;

/**
 * Test Utils.inputIncomingParse output matches expected.
 */
const testInputIncomingParse = (desc, testString, expectedString) => {
    expect.assertions(1);
    expect(Utils.inputIncomingParse(testString).result).toStrictEqual(expectedString);
};

describe('utils', () => {
    describe('incoming input parsing', () => {
        describe('should strip spaces and replace next line', () => {
            const testData = [
                ['string with spaces', ' String with spaces in the middle   and at both ends  ', 'String with spaces in the middle and at both ends'],
                ['multiline string 1', `line
                    another line`, 'line<br> another line'],
                ['multiline string 2', `line

                    another line`, 'line<br><br> another line'],
                ['multiline string 3', `line


                    another line`, 'line<br><br> another line'],
            ];

            it.each(testData)('%s', testInputIncomingParse); // eslint-disable-line jest/expect-expect
        });

        describe('should replace internal links', () => {
            const testData = [
                ['replace photo url', `${origin}/p/123456`, '<a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>'],
                ['replace photo path', '/p/123456', '<a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>'],
                ['replace photo hash', '#123456', '<a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>'],
                ['replace encoded url', 'https://ru.wikipedia.org/wiki/%D0%A4%D0%BE%D1%82%D0%BE%D0%B3%D1%80%D0%B0%D1%84%D0%B8%D1%8F', '<a href="https://ru.wikipedia.org/wiki/Фотография" rel="nofollow noopener" target="_blank">https://ru.wikipedia.org/wiki/Фотография</a>'],
                ['shorten internal url', `${origin}/u/klimashkin/photo`, '<a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>'],
                ['replace internal path', '/u/klimashkin/photo', '<a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>'],
                ['replace protected photo url', `${origin}/_pr/a/b/c/abc.jpg`, '<a target="_blank" class="innerLink" href="/_p/a/b/c/abc.jpg">/_p/a/b/c/abc.jpg</a>'],
                ['replace protected photo url 1', `${origin}/_prn/a/b/c/abc.png`, '<a target="_blank" class="innerLink" href="/_p/a/b/c/abc.png">/_p/a/b/c/abc.png</a>'],
            ];

            it.each(testData)('%s', testInputIncomingParse); // eslint-disable-line jest/expect-expect
        });

        describe('should respect heading and trailing punctuation for internal links', () => {
            const testData = [
                ['photo url', `(${origin}/p/123456) #123456.`, '(<a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>) <a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>.'],
                ['internal url', `${origin}/u/klimashkin/photo, ${origin}/u/klimashkin/photo; (/u/klimashkin/photo)`, '<a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>, <a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>; (<a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>)'],
            ];

            it.each(testData)('%s', testInputIncomingParse); // eslint-disable-line jest/expect-expect
        });

        describe('should replace external links', () => {
            const testData = [
                ['replace url', 'https://jestjs.io/docs/expect#expectassertionsnumber', '<a href="https://jestjs.io/docs/expect#expectassertionsnumber" rel="nofollow noopener" target="_blank">https://jestjs.io/docs/expect#expectassertionsnumber</a>'],
                ['replace www url', 'www.moodle.org', '<a href="http://www.moodle.org" rel="nofollow noopener" target="_blank">www.moodle.org</a>'],
                ['replace url with params', 'https://jestjs.io/docs/expect?show=all', '<a href="https://jestjs.io/docs/expect?show=all" rel="nofollow noopener" target="_blank">https://jestjs.io/docs/expect?show=all</a>'],
            ];

            it.each(testData)('%s', testInputIncomingParse); // eslint-disable-line jest/expect-expect
        });

        describe('should replace external links with punctuation', () => {
            const testData = [
                ['replace url', 'Please check https://jestjs.io/docs/expect. This is important.', 'Please check <a href="https://jestjs.io/docs/expect" rel="nofollow noopener" target="_blank">https://jestjs.io/docs/expect</a>. This is important.'],
                ['replace urls multiline', `Check www.github.com,
                    and also http://docs.pastvu.com;`, 'Check <a href="http://www.github.com" rel="nofollow noopener" target="_blank">www.github.com</a>,<br> and also <a href="http://docs.pastvu.com" rel="nofollow noopener" target="_blank">http://docs.pastvu.com</a>;'],
                ['replace identical urls', 'Please check https://jestjs.io/docs/expect,  https://jestjs.io/docs/expect.', 'Please check <a href="https://jestjs.io/docs/expect" rel="nofollow noopener" target="_blank">https://jestjs.io/docs/expect</a>, <a href="https://jestjs.io/docs/expect" rel="nofollow noopener" target="_blank">https://jestjs.io/docs/expect</a>.'],
            ];

            it.each(testData)('%s', testInputIncomingParse); // eslint-disable-line jest/expect-expect
        });

        it('should replace links in complex example', () => {
            expect.assertions(1);

            const testString = `Hello /u/testuser, this photo #123456 (also #123457, #456789)
                are related and taken from the http://oldtown.com.
                Please amend the sources. You can find more information on https://docs.pastvu.com; https://docs.pastvu.com?id=3.`;

            const expectedString = 'Hello <a target="_blank" class="innerLink" href="/u/testuser">/u/testuser</a>, this photo #123456 (also <a target="_blank" class="sharpPhoto" href="/p/123457">#123457</a>, <a target="_blank" class="sharpPhoto" href="/p/456789">#456789</a>)<br> are related and taken from the <a href="http://oldtown.com" rel="nofollow noopener" target="_blank">http://oldtown.com</a>.<br> Please amend the sources. You can find more information on <a href="https://docs.pastvu.com" rel="nofollow noopener" target="_blank">https://docs.pastvu.com</a>; <a href="https://docs.pastvu.com?id=3" rel="nofollow noopener" target="_blank">https://docs.pastvu.com?id=3</a>.';

            testInputIncomingParse('', testString, expectedString);
        });
    });
});
