/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import Utils from '../Utils';
import config from '../../config';

const origin = config.client.origin;
const host = config.client.host;

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
                ['replace photo url param', `${origin}/p/123456?hl=comment-123`, '<a target="_blank" class="innerLink" href="/p/123456?hl=comment-123">/p/123456?hl=comment-123</a>'],
                ['replace photo path', '/p/123456', '<a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>'],
                ['replace photo hash', '#123456', '<a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>'],
                ['replace encoded url', 'https://ru.wikipedia.org/wiki/%D0%A4%D0%BE%D1%82%D0%BE%D0%B3%D1%80%D0%B0%D1%84%D0%B8%D1%8F', '<a href="https://ru.wikipedia.org/wiki/Фотография" rel="nofollow noopener" target="_blank">https://ru.wikipedia.org/wiki/Фотография</a>'],
                ['replace encoded url with space', 'https://forum.vgd.ru/post/14/127242/p4009576.htm?hlt=%D0%BD%D0%B8%D0%BA%D0%BE%D0%BB%D0%B0%D0%B5%D0%B2%D1%81%D0%BA%D0%B0%D1%8F+%D1%81%D0%BB%D0%BE%D0%B1#pp4009576', '<a href="https://forum.vgd.ru/post/14/127242/p4009576.htm?hlt=николаевская+слоб#pp4009576" rel="nofollow noopener" target="_blank">https://forum.vgd.ru/post/14/127242/p4009576.htm?hlt=николаевская+слоб#pp4009576</a>'],
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
                ['photo urls', `${origin}/p/123456 ${origin}/p/123456`, '<a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a> <a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>'],
                ['photo hashes', '#123456 #123456', '<a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a> <a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a>'],
                ['internal url', `${origin}/u/klimashkin/photo, ${origin}/u/klimashkin/photo; (/u/klimashkin/photo)`, '<a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>, <a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>; (<a target="_blank" class="innerLink" href="/u/klimashkin/photo">/u/klimashkin/photo</a>)'],
            ];

            it.each(testData)('%s', testInputIncomingParse); // eslint-disable-line jest/expect-expect
        });

        describe('should replace external links', () => {
            const testData = [
                ['replace url', 'https://jestjs.io/docs/expect#expectassertionsnumber', '<a href="https://jestjs.io/docs/expect#expectassertionsnumber" rel="nofollow noopener" target="_blank">https://jestjs.io/docs/expect#expectassertionsnumber</a>'],
                ['replace www url', 'www.moodle.org', '<a href="http://www.moodle.org" rel="nofollow noopener" target="_blank">www.moodle.org</a>'],
                ['replace url with params', 'https://jestjs.io/docs/expect?show=all&filter=1', '<a href="https://jestjs.io/docs/expect?show=all&filter=1" rel="nofollow noopener" target="_blank">https://jestjs.io/docs/expect?show=all&filter=1</a>'],
                ['replace subdomain url', `https://docs.${host}/rules`, `<a href="https://docs.${host}/rules" rel="nofollow noopener" target="_blank">https://docs.${host}/rules</a>`],
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

            const testString = `Hello /u/testuser, thanks for photos #123456 #123457 (also #123458, #456789)
                They are related and came from https://flic.kr/p/abcde (discussion at ${origin}/p/123456?hl=comment-12)
                You can find more information on https://docs.pastvu.com; https://docs.pastvu.com?id=3.`;

            const expectedString = 'Hello <a target="_blank" class="innerLink" href="/u/testuser">/u/testuser</a>, thanks for photos <a target="_blank" class="sharpPhoto" href="/p/123456">#123456</a> <a target="_blank" class="sharpPhoto" href="/p/123457">#123457</a> (also <a target="_blank" class="sharpPhoto" href="/p/123458">#123458</a>, <a target="_blank" class="sharpPhoto" href="/p/456789">#456789</a>)<br> They are related and came from <a href="https://flic.kr/p/abcde" rel="nofollow noopener" target="_blank">https://flic.kr/p/abcde</a> (discussion at <a target="_blank" class="innerLink" href="/p/123456?hl=comment-12">/p/123456?hl=comment-12</a>)<br> You can find more information on <a href="https://docs.pastvu.com" rel="nofollow noopener" target="_blank">https://docs.pastvu.com</a>; <a href="https://docs.pastvu.com?id=3" rel="nofollow noopener" target="_blank">https://docs.pastvu.com?id=3</a>.';

            testInputIncomingParse('', testString, expectedString);
        });
    });
});
