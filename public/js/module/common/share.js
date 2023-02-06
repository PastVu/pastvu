/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Share dialog for social networks
 */
define(['underscore', 'jquery', 'Utils', 'socket!', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/common/share.pug', 'css!style/common/share'], function (_, $, Utils, socket, P, globalVM, ko, Cliche, pug) {
    'use strict';

    // https://www.iconfinder.com/icons/410527/facebook_social_icon#size=128
    const socials = [
        {
            id: 'fb',
            name: 'Facebook',
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjxzdmcgaGVpZ2h0PSI1MDAiIGlkPSJzdmcyIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI1MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6Y2M9Imh0dHA6Ly9jcmVhdGl2ZWNvbW1vbnMub3JnL25zIyIgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIiB4bWxuczppbmtzY2FwZT0iaHR0cDovL3d3dy5pbmtzY2FwZS5vcmcvbmFtZXNwYWNlcy9pbmtzY2FwZSIgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIiB4bWxuczpzb2RpcG9kaT0iaHR0cDovL3NvZGlwb2RpLnNvdXJjZWZvcmdlLm5ldC9EVEQvc29kaXBvZGktMC5kdGQiIHhtbG5zOnN2Zz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzIGlkPSJkZWZzNCIvPjxnIGlkPSJsYXllcjEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsLTU1Mi4zNjIxOCkiPjxwYXRoIGQ9Im0gMCw1NTIuMzYyMTQgMCw1MDAuMDAwMDYgNTAwLDAgMCwtNTAwLjAwMDA2IHoiIGlkPSJyZWN0Mjk4OS03IiBzdHlsZT0iZmlsbDojNDU2MTlkO2ZpbGwtb3BhY2l0eToxO3N0cm9rZTpub25lIi8+PHBhdGggZD0iTSAyODkuNjg3NSA2MCBDIDIyMS45MDMxNyA2MCAxOTkuNTMxMjUgOTEuMTAwNTcgMTk5LjUzMTI1IDE0NC40Mzc1IEwgMTk5LjUzMTI1IDE4Ni42NTYyNSBMIDE1NSAxODYuNjU2MjUgTCAxNTUgMjUwLjAzMTI1IEwgMTk5LjUzMTI1IDI1MC4wMzEyNSBMIDE5OS41MzEyNSA0NDAgTCAyODEuNjU2MjUgNDQwIEwgMjgxLjY1NjI1IDI1MC4wMzEyNSBMIDMzNy40Njg3NSAyNTAuMDMxMjUgTCAzNDQuOTY4NzUgMTg2LjY1NjI1IEwgMjgxLjY1NjI1IDE4Ni42NTYyNSBMIDI4MS42NTYyNSAxNDkgQyAyODEuNjU2MjUgMTMxLjk3OTY2IDI4NS4zOTE0OCAxMjMuMzQzNzUgMzExLjgxMjUgMTIzLjM0Mzc1IEwgMzQ0Ljk2ODc1IDEyMy4zNDM3NSBMIDM0NC45Njg3NSA2MCBMIDI4OS42ODc1IDYwIHogIiBpZD0icmVjdDI5ODktMSIgc3R5bGU9ImZpbGw6I2ZmZmZmZjtmaWxsLW9wYWNpdHk6MTtzdHJva2U6bm9uZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCw1NTIuMzYyMTgpIi8+PHBhdGggZD0iTSAzNDQuOTY4NzUgNjAgTCAzNDQuOTY4NzUgMTIzLjM0Mzc1IEwgMzExLjgxMjUgMTIzLjM0Mzc1IEMgMjg1LjM5MTQ4IDEyMy4zNDM3NSAyODEuNjU2MjUgMTMxLjk3OTY2IDI4MS42NTYyNSAxNDkgTCAyODEuNjU2MjUgMTg2LjY1NjI1IEwgMzQ0Ljk2ODc1IDE4Ni42NTYyNSBMIDMzNy40Njg3NSAyNTAuMDMxMjUgTCAyODEuNjU2MjUgMjUwLjAzMTI1IEwgMjgxLjY1NjI1IDQ0MCBMIDE5OS41MzEyNSA0NDAgTCAyNTkuNTMxMjUgNTAwIEwgNTAwIDUwMCBMIDUwMCAyMTUuMDMxMjUgTCAzNDQuOTY4NzUgNjAgeiAiIGlkPSJwYXRoMzAyMyIgc3R5bGU9ImZpbGw6IzAwMDAwMDtzdHJva2U6bm9uZTtzdHJva2Utd2lkdGg6MXB4O3N0cm9rZS1saW5lY2FwOmJ1dHQ7c3Ryb2tlLWxpbmVqb2luOm1pdGVyO3N0cm9rZS1vcGFjaXR5OjE7b3BhY2l0eTowLjI5OTk5OTk5OTk5OTk5OTk5IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLDU1Mi4zNjIxOCkiLz48L2c+PC9zdmc+',
        },
        {
            id: 'vk',
            name: 'Vkontakte',
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjxzdmcgaGVpZ2h0PSI1MDAiIGlkPSJzdmcyIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI1MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6Y2M9Imh0dHA6Ly9jcmVhdGl2ZWNvbW1vbnMub3JnL25zIyIgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIiB4bWxuczppbmtzY2FwZT0iaHR0cDovL3d3dy5pbmtzY2FwZS5vcmcvbmFtZXNwYWNlcy9pbmtzY2FwZSIgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIiB4bWxuczpzb2RpcG9kaT0iaHR0cDovL3NvZGlwb2RpLnNvdXJjZWZvcmdlLm5ldC9EVEQvc29kaXBvZGktMC5kdGQiIHhtbG5zOnN2Zz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzIGlkPSJkZWZzNCIvPjxnIGlkPSJsYXllcjEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsLTU1Mi4zNjIxOCkiPjxwYXRoIGQ9Im0gMCw1NTIuMzYyMTYgMCw1MDAuMDAwMDQgNTAwLDAgMCwtNTAwLjAwMDA0IHoiIGlkPSJyZWN0Mjk4OS0xIiBzdHlsZT0iZmlsbDojNTM3NTk5O2ZpbGwtb3BhY2l0eToxO3N0cm9rZTpub25lIi8+PGcgaWQ9ImxheWVyMS05IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtNTQ5LjAwNTE1LDgwLjI5NDM3MikiLz48ZyBpZD0ibGF5ZXIxLTYiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC01NzUuNzE0MjksMzkuOTk5OTk5KSIvPjxnIGlkPSJsYXllcjEtMCIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMjIuODIxNDMxLDQ4NS4wMzU2OSkiLz48cGF0aCBkPSJNIDUwMCwyMDAuODAzNTcgNTAwLDUwMCAzMjYuNzg0MzUsNTAwIDE0Ni41MzUyNSwzMTkuNzUwOSAyNTEuMTA1ODcsMjEzLjg5NDEyIDE4Ni42NTcyNSwxNDkuNDQ1NSBsIDk1LjYwOTI3LC03LjQyNjMgNzAsNzAgOTQuOTY1NjIsLTYzLjk4MzQ5IHoiIGlkPSJwYXRoMjk5OCIgc3R5bGU9ImZpbGw6IzAwMDAwMDtzdHJva2U6bm9uZTtzdHJva2Utd2lkdGg6MXB4O3N0cm9rZS1saW5lY2FwOmJ1dHQ7c3Ryb2tlLWxpbmVqb2luOm1pdGVyO3N0cm9rZS1vcGFjaXR5OjE7b3BhY2l0eTowLjI5OTk5OTk5OTk5OTk5OTk5IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLDU1Mi4zNjIxOCkiLz48cGF0aCBkPSJNIDI2NC45Njg3NSAxMzYuNDM3NSBDIDI0My42ODA2MSAxMzYuNTM2NzEgMjMwLjEwNTkzIDEzNi41NjI1IDIxMC45Njg3NSAxMzYuNTYyNSBDIDE5NC45NjI0NiAxMzYuNTYyNSAxODUuOTczMjUgMTQzLjA0MTU1IDE4NS42ODc1IDE0Ni45MDYyNSBDIDE4NS40MjYyMSAxNTAuNDM5NzQgMTkzLjU5NTE1IDE1My4yOTY4OSAxOTguNTYyNSAxNTYuMTU2MjUgQyAyMDMuMzU3MjYgMTU5LjEyODYyIDIwNy42ODc1IDE2OC41NjQzIDIwNy42ODc1IDE3NC45Mzc1IEwgMjA3LjY4NzUgMjMwLjUzMTI1IEMgMjA3LjY4NzUgMjM1LjgxNDM4IDIwNi40ODcwMiAyMzkuNDk0MTUgMjAyLjIxODc1IDI0Mi45Mzc1IEMgMjAwLjE4NTUxIDI0NC41Nzc3OSAxOTcuNzY4NjMgMjQ1LjAxNDUgMTk1LjE1NjI1IDI0NSBDIDE5My4wNDIxOCAyNDQuOTg4NTEgMTkwLjE2Njg3IDI0NC41OTM0MiAxODguMTg3NSAyNDIuMDMxMjUgQyAxNjcuMTA0MzQgMjE0Ljc0MDQzIDE2Ny4wMzQ3NiAyMTEuMzcwNCAxMzcuNSAxNTYuMzc1IEMgMTM2LjA2NzUzIDE1My43MDc2NSAxMzQuNjUyMzUgMTUwLjg3NzY0IDEzMS43MTg3NSAxNDguNzUgQyAxMjguNzg1MTQgMTQ2LjYyMjM0IDEyNC40Mzc4OCAxNDUuMjE4NzUgMTE3LjQ2ODc1IDE0NS4yMTg3NSBDIDkzLjcyOTE0IDE0NS4yMTg3NSA3OS4wNzgzODkgMTQ1LjU2MjUgNjMuNDY4NzUgMTQ1LjU2MjUgQyA0OC42OTM1MTYgMTQ1LjU2MjUgNTAuMTE0NzExIDE1NC42MjM0MyA1Mi4wOTM3NSAxNTguNzUgQyA2OS44MDc3NiAxOTUuNjg1ODMgODcuNzkzMzY5IDIzMC45NTMxNiAxMDguNDY4NzUgMjY2Ljc1IEMgMTMyLjY4MTM3IDMwOC42NzExMyAxNTQuODE2NTQgMzMzLjg1MTIyIDE5Mi4wNjI1IDM1MS45Mzc1IEMgMjAwLjcwNzc0IDM1Ni4xMzU1NCAyMTYuMjk2MDUgMzYwLjQ2ODc1IDIzNC4zMTI1IDM2MC40Njg3NSBMIDI3Mi41OTM3NSAzNjAuNDY4NzUgQyAyNzcuNTEyMzYgMzYwLjQ2ODc1IDI4NS42ODc1IDM1Ni41ODc5MyAyODUuNjg3NSAzNTEuMzc1IEwgMjg1LjY4NzUgMzIyLjY1NjI1IEMgMjg1LjY4NzUgMzE0LjQ0MzAxIDI5My44NzY0NyAzMTEuNDU2ODQgMjk4LjM0Mzc1IDMwOS40Mzc1IEMgMzAzLjYwNjc5IDMwNy4wNTg0NCAzMDkuMTI1OTkgMzEwLjgwOTAyIDMxMS45MDYyNSAzMTMuNzgxMjUgQyAzMzMuMzA3MjggMzM2LjY2MDAxIDMzMC44NzUyNCAzMzQuMTcwNjYgMzUwLjM3NSAzNTQuNjU2MjUgQyAzNTQuNzgxMjcgMzU5LjI4NTI5IDM1OC4xMDg3NiAzNjEuNzE4NzUgMzY2LjQzNzUgMzYxLjcxODc1IEMgNDIyLjY3ODYgMzYxLjcxODc1IDQyMi43MjUwMyAzNjEuODI2MjcgNDM2LjE1NjI1IDM2MS43MTg3NSBDIDQzOS44NDQyOCAzNjEuNjg5MjIgNDQ1LjMyMTAyIDM1Ni4xNTY1NyA0NDYuNTMxMjUgMzU0IEMgNDQ4LjEyODg0IDM1MS4xNTMyNSA0NTEuNzYwNzggMzQwLjk5MTMyIDQ0NS45Mzc1IDMzNC40MDYyNSBDIDQyNi4xNzI5NSAzMTIuMDU2MTYgNDA2LjAyNjggMjkxLjU5MjQ4IDM4Ni43MTg3NSAyNzEuMjgxMjUgQyAzODUuMjQ2NiAyNjkuNzMyNjMgMzg0LjEzNDI1IDI2Ny42MzYzNSAzODQuMDkzNzUgMjY1LjUgQyAzODQuMDQ5NjggMjYzLjE2Mzc5IDM4NS4zNTI4OCAyNjAuODk1ODMgMzg2LjcxODc1IDI1OSBDIDQwOC4zNzQwMyAyMjguOTQyNjIgNDI2LjI2MjMyIDIwMy40OTA3MyA0NDUuNzE4NzUgMTcxLjg3NSBDIDQ1Mi4wNDMyMiAxNjEuNTk4MDMgNDUxLjIyNTI5IDE1NC4zMTk0OCA0NTAuMDYyNSAxNTEuODEyNSBDIDQ0OC43MTU5NCAxNDguOTA5MzMgNDQ0LjU3MDUzIDE0NC45MDA1IDQzOS44MTI1IDE0NC44NzUgQyA0MTMuODMgMTQ0LjcyOTIxIDQwMi41OTE2NCAxNDQuMzY1NDUgMzc0Ljg3NSAxNDQuNDA2MjUgQyAzNjYuNTk2NDUgMTQ0LjQxODQzIDM1OS4yNjQ1OCAxNDMuNzgyOTEgMzU0LjcxODc1IDE1My43NSBDIDM0Mi41Mzc0IDE4MC40NTg1MyAzMjIuNjYyNzQgMjIxLjIxMzkyIDMwNS40MDYyNSAyMzguMTU2MjUgQyAzMDIuMjE5ODUgMjQxLjI4MzMxIDI5Ny45NjQzOCAyNDMuNjA2NyAyOTQuMjUgMjQzLjYyNSBDIDI5MC41MzU2NSAyNDMuNjQzMTQgMjg2LjU4NjIgMjQxLjExMzA4IDI4Ni4wMzEyNSAyMzUuMDYyNSBDIDI4NS42MDYyNyAyMDUuOTk0MjggMjg1Ljk1OTc1IDE4MS4xOTQ4NSAyODUuODEyNSAxNTIuNzE4NzUgQyAyODUuNzY3NTIgMTQ0LjAxNDYxIDI4Mi4wOTcyMSAxNDEuNzc1MDUgMjc5LjMxMjUgMTM5Ljg0Mzc1IEMgMjc1LjUzNDk1IDEzNy4yMjM5MyAyNjkuNTY1ODMgMTM2LjQxNTYgMjY0Ljk2ODc1IDEzNi40Mzc1IHogIiBpZD0icmVjdDI5ODktNyIgc3R5bGU9ImZpbGw6I2ZmZmZmZjtmaWxsLW9wYWNpdHk6MTtzdHJva2U6bm9uZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCw1NTIuMzYyMTgpIi8+PC9nPjwvc3ZnPg==',
        },
        {
            id: 'ok',
            name: 'Odnoklassniki',
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjwhRE9DVFlQRSBzdmcgIFBVQkxJQyAnLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4nICAnaHR0cDovL3d3dy53My5vcmcvR3JhcGhpY3MvU1ZHLzEuMS9EVEQvc3ZnMTEuZHRkJz48c3ZnIGVuYWJsZS1iYWNrZ3JvdW5kPSJuZXcgMCAwIDUxMiA1MTIiIGhlaWdodD0iNTEycHgiIGlkPSJMYXllcl8xIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiB3aWR0aD0iNTEycHgiIHhtbDpzcGFjZT0icHJlc2VydmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiPjxnPjxwb2x5Z29uIGNsaXAtcnVsZT0iZXZlbm9kZCIgZmlsbD0iI0YxODQyQiIgZmlsbC1ydWxlPSJldmVub2RkIiBwb2ludHM9IjAsMCA0MzUuMjA3LDAgNTEyLDc2Ljc5NSA1MTIsNTEyIDc2Ljc5Myw1MTIgMCw0MzUuMjAzICAgICAiLz48cG9seWdvbiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGZpbGw9IiNGOEE1NUUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgcG9pbnRzPSI0MzUuMjA3LDAgNTEyLDc2Ljc5NSA0MzUuMjA3LDc2Ljc5NSAgIi8+PHBvbHlnb24gY2xpcC1ydWxlPSJldmVub2RkIiBmaWxsPSIjREI2ODI2IiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHBvaW50cz0iNDM1LjIwNyw3Ni43OTUgNTEyLDE1My41ODQgNTEyLDc2Ljc5NSAgIi8+PHBvbHlnb24gY2xpcC1ydWxlPSJldmVub2RkIiBmaWxsPSIjRjhBNTVFIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIHBvaW50cz0iNzYuNzkzLDUxMiAwLDQzNS4yMDMgNzYuNzkzLDQzNS4yMDMgICIvPjxwb2x5Z29uIGNsaXAtcnVsZT0iZXZlbm9kZCIgZmlsbD0iI0RCNjgyNiIgZmlsbC1ydWxlPSJldmVub2RkIiBwb2ludHM9IjE1My41ODgsNTEyIDc2Ljc5Myw0MzUuMjAzIDc2Ljc5Myw1MTIgICIvPjxwYXRoIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTI1NS45MjgsMjA5LjgxNmMyMC44NTQsMCwzNy42MzktMTYuNzc3LDM3LjYzOS0zNy40ODggICBzLTE2Ljc4NS0zNy40OS0zNy42MzktMzcuNDljLTIwLjcxMSwwLTM3LjQ5MiwxNi43NzktMzcuNDkyLDM3LjQ5UzIzNS4yMTcsMjA5LjgxNiwyNTUuOTI4LDIwOS44MTZMMjU1LjkyOCwyMDkuODE2eiAgICBNMjAyLjEwOSwzNDguMTI5bDE0LjM2My0xNC4yMDNjLTE2LjQ3Ny00LjA4Ni0zMi4wNTEtMTAuNTg2LTQ2LjEwNy0xOS4wNDdsLTMuOTMtMi40MjJMMjAyLjEwOSwzNDguMTI5eiBNMzQxLjYzNywzMTQuODc5ICAgYy0xNC4yMTEsOC40NjEtMjkuNjI5LDE0Ljk2MS00Ni4xMDUsMTkuMDQ3bDQ5LjU4Miw0OS41ODJjMy4zMjgsMy4zMjQsNS41OSw3LjI1NCw2LjgwNSwxMS40ODggICBjMi41NjMsOS4wNzQsMC4zMDEsMTkuMzUyLTYuODA1LDI2LjQ1N2MtMTAuNDM0LDEwLjQyNi0yNy41MTYsMTAuNDI2LTM3Ljk0NSwwbC01MS4yNC01MS4yNWwtMTUuODc1LDE1Ljg3NWwtMzUuMjIzLDM1LjM3NSAgIGMtMTAuNTgsMTAuNDI2LTI3LjUxNCwxMC40MjYtMzcuOTQxLDBMMjU3LjQzOCw1MTJoMTA4LjUzMWgxMDIuOTQ1SDUxMlYzMDEuNTc0TDMxOS40MTgsMTA4Ljk4OCAgIGMxNi4xNjgsMTYuMTc2LDI2LjE0OCwzOC41NDUsMjYuMTQ4LDYzLjM0YzAsNDkuNTgyLTQwLjA1OSw4OS42NDEtODkuNjM5LDg5LjY0MWMtMjQuNDkyLDAtNDYuODYzLTkuODI0LTYzLjAzOS0yNmw0OC44MjQsNDguODI4ICAgYzQuNjg4LDAuNjAyLDkuMzcxLDAuOTAyLDE0LjIxNSwwLjkwMmMyMC4xLDAsMzguODUtNS4xMzcsNTUuMTctMTQuMjAzYzcuMTA1LTQuMDgyLDkuNjc2LTcuNDEsMTguNDQ1LTcuNDEgICBjMTQuODEzLDAsMjYuNzU4LDEyLjA5OCwyNi43NTgsMjYuOTA2YzAsOC43NjYtNC4yMzQsMTYuNDg0LTEwLjczNCwyMS40NjVMMzQxLjYzNywzMTQuODc5eiIgZmlsbD0iI0RCNjgyNiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PHBhdGggY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMTY2LjI4MywxNzIuMzI4YzAsNDkuNTgyLDQwLjIxMSw4OS42NDEsODkuNjQ1LDg5LjY0MSAgIGM0OS41OCwwLDg5LjYzOS00MC4wNTksODkuNjM5LTg5LjY0MWMwLTQ5LjU4NC00MC4wNTktODkuNjM5LTg5LjYzOS04OS42MzlDMjA2LjQ5NCw4Mi42ODksMTY2LjI4MywxMjIuNzQ0LDE2Ni4yODMsMTcyLjMyOCAgIEwxNjYuMjgzLDE3Mi4zMjh6IE0yNTUuOTI4LDI4NS42OTljLTE5Ljk1NywwLTM4LjcwMS01LjEzNy01NS4wMjktMTQuMjAzYy03LjEwNS00LjA4Mi05LjY3Mi03LjQxLTE4LjQ0MS03LjQxICAgYy0xNC44MTMsMC0yNi45MDYsMTIuMDk4LTI2LjkwNiwyNi45MDZjMCw4Ljc2Niw0LjIzMiwxNi40ODQsMTAuODg1LDIxLjQ2NWMxLjIwOSwwLjc1OCwyLjU2OCwxLjY2OCwzLjkzLDIuNDIyICAgYzE0LjA1Nyw4LjQ2MSwyOS42MzEsMTQuOTYxLDQ2LjEwNywxOS4wNDdsLTQ5LjU4NCw0OS41ODJjLTEwLjQzMiwxMC40My0xMC40MzIsMjcuNTE2LDAsMzcuOTQ1ICAgYzEwLjQyOCwxMC40MjYsMjcuMzYxLDEwLjQyNiwzNy45NDEsMGw1MS4wOTgtNTEuMjVsNTEuMjQsNTEuMjVjMTAuNDMsMTAuNDI2LDI3LjUxMiwxMC40MjYsMzcuOTQ1LDAgICBjMTAuNDI2LTEwLjQzLDEwLjQyNi0yNy41MTYsMC0zNy45NDVsLTQ5LjU4Mi00OS41ODJjMTYuNDc3LTQuMDg2LDMxLjg5NS0xMC41ODYsNDYuMTA1LTE5LjA0NyAgIGMxLjM1OS0wLjc1NCwyLjcxOS0xLjY2NCwzLjkzLTIuNDIyYzYuNS00Ljk4LDEwLjczNC0xMi42OTksMTAuNzM0LTIxLjQ2NWMwLTE0LjgwOS0xMS45NDUtMjYuOTA2LTI2Ljc1OC0yNi45MDYgICBjLTguNzcsMC0xMS4zNCwzLjMyOC0xOC40NDUsNy40MUMyOTQuNzc3LDI4MC41NjMsMjc2LjAyNywyODUuNjk5LDI1NS45MjgsMjg1LjY5OUwyNTUuOTI4LDI4NS42OTl6IE0yNTUuOTI4LDIwOS44MTYgICBjLTIwLjcxMSwwLTM3LjQ5Mi0xNi43NzctMzcuNDkyLTM3LjQ4OHMxNi43ODEtMzcuNDksMzcuNDkyLTM3LjQ5YzIwLjg1NCwwLDM3LjYzOSwxNi43NzksMzcuNjM5LDM3LjQ5ICAgUzI3Ni43ODEsMjA5LjgxNiwyNTUuOTI4LDIwOS44MTZMMjU1LjkyOCwyMDkuODE2eiIgZmlsbD0iI0ZGRkZGRiIgZmlsbC1ydWxlPSJldmVub2RkIi8+PC9nPjwvc3ZnPg==',
        },
        {
            id: 'tw',
            name: 'Twitter',
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjxzdmcgaGVpZ2h0PSI1MDAiIGlkPSJzdmcyIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI1MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6Y2M9Imh0dHA6Ly9jcmVhdGl2ZWNvbW1vbnMub3JnL25zIyIgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIiB4bWxuczppbmtzY2FwZT0iaHR0cDovL3d3dy5pbmtzY2FwZS5vcmcvbmFtZXNwYWNlcy9pbmtzY2FwZSIgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIiB4bWxuczpzb2RpcG9kaT0iaHR0cDovL3NvZGlwb2RpLnNvdXJjZWZvcmdlLm5ldC9EVEQvc29kaXBvZGktMC5kdGQiIHhtbG5zOnN2Zz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzIGlkPSJkZWZzNCIvPjxnIGlkPSJsYXllcjEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsLTU1Mi4zNjIxOCkiPjxwYXRoIGQ9Im0gMCw1NTIuMzYyMTYgMCw1MDAuMDAwMDQgNTAwLDAgMCwtNTAwLjAwMDA0IHoiIGlkPSJyZWN0Mjk4OS0xIiBzdHlsZT0iZmlsbDojNTVhY2VlO2ZpbGwtb3BhY2l0eToxO3N0cm9rZTpub25lIi8+PGcgaWQ9ImxheWVyMS05IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtNTQ5LjAwNTE1LDgwLjI5NDM3MikiLz48ZyBpZD0ibGF5ZXIxLTYiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC01NzUuNzE0MjksMzkuOTk5OTk5KSIvPjxnIGlkPSJsYXllcjEtOTMiIHRyYW5zZm9ybT0ibWF0cml4KDAuOTk5Mjg5NDUsMCwwLDAuOTk5Mjg5NDUsNDc0LjcwMDIsLTQwLjgxOTI4KSIvPjxwYXRoIGQ9Ik0gNTAwLDE1NC40NDE5NiA1MDAsNTAwIDE3NC4yODU3Miw1MDAgNTAuMDAwMDAxLDM3NS43MTQyOCBsIDguNjYwNzEzLDIuNDU1MzYgMTEyLjA1MzU3NiwtNC41OTgyMSAtNTYuNjI5NDcsLTU2LjYyOTQ3IDMuMjYyNjEsLTI4LjYxMjM5IEwgODguMzkyODU5LDI1OS4zNzUgMzYwLDE1NC4yODU3MSA0MzguOTk4MzMsOTMuNDQwMjg4IHoiIGlkPSJwYXRoMjk5OCIgc3R5bGU9ImZpbGw6IzAwMDAwMDtzdHJva2U6bm9uZTtzdHJva2Utd2lkdGg6MXB4O3N0cm9rZS1saW5lY2FwOmJ1dHQ7c3Ryb2tlLWxpbmVqb2luOm1pdGVyO3N0cm9rZS1vcGFjaXR5OjE7b3BhY2l0eTowLjMiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsNTUyLjM2MjE4KSIvPjxwYXRoIGQ9Ik0gMzI0LjgxMjUgODcuNSBDIDI4MC40NzQwMSA4OC42MjM0OTEgMjQ0LjkwNjI1IDEyNC45MTQyMiAyNDQuOTA2MjUgMTY5LjUzMTI1IEMgMjQ0LjkwNjI1IDE3NS45NTQwOSAyNDUuNTk1MjcgMTgyLjIzMzIgMjQ3IDE4OC4yNSBDIDE3OC43OTI5MSAxODQuODIzNDMgMTE4LjMyMTQxIDE1Mi4xNTMxNCA3Ny44NDM3NSAxMDIuNSBDIDcwLjc3OTQxMyAxMTQuNjE0ODkgNjYuNzE4NzUgMTI4LjcyNjk3IDY2LjcxODc1IDE0My43ODEyNSBDIDY2LjcxODc1IDE3Mi4yNDk1OSA4MS4yMjg4NTggMTk3LjM0OTIzIDEwMy4yNSAyMTIuMDYyNSBDIDg5LjgwMzQ3MSAyMTEuNjMyMTUgNzcuMTI5OTMgMjA3LjkyODAyIDY2LjA2MjUgMjAxLjc4MTI1IEMgNjYuMDU2NTA0IDIwMi4xMjIyNyA2Ni4wNjI1IDIwMi40OTQ2MSA2Ni4wNjI1IDIwMi44NDM3NSBDIDY2LjA2MjUgMjQyLjU5ODc3IDk0LjM1OTg3OCAyNzUuNzI5NzUgMTMxLjkwNjI1IDI4My4yODEyNSBDIDEyNS4wMjA2IDI4NS4xNDg4MiAxMTcuNzY3ODEgMjg2LjE1NjI1IDExMC4yODEyNSAyODYuMTU2MjUgQyAxMDQuOTg3MDcgMjg2LjE1NjI1IDk5Ljg1MzcwOCAyODUuNjUzNzcgOTQuODQzNzUgMjg0LjY4NzUgQyAxMDUuMjk0MDMgMzE3LjI4ODg2IDEzNS41NjI1OCAzNDEuMDI5ODEgMTcxLjQ2ODc1IDM0MS42ODc1IEMgMTQzLjM4MjA0IDM2My43MDA1NCAxMDguMDQ5NTggMzc2LjgxMjUgNjkuNTkzNzUgMzc2LjgxMjUgQyA2Mi45NzYwNTYgMzc2LjgxMjUgNTYuNDIyODEzIDM3Ni40NTA3NyA1MCAzNzUuNjg3NSBDIDg2LjMyODM5OSAzOTguOTgzNTQgMTI5LjQ0MTAyIDQxMi41NjI1IDE3NS43ODEyNSA0MTIuNTYyNSBDIDMyNi43MzgxNSA0MTIuNTYyNSA0MDkuMjgxMjUgMjg3LjUxMTc4IDQwOS4yODEyNSAxNzkuMDYyNSBDIDQwOS4yODEyNSAxNzUuNTA2IDQwOS4yMTY2IDE3MS45MzAyOSA0MDkuMDYyNSAxNjguNDA2MjUgQyA0MjUuMDkxMTggMTU2Ljg1OTc1IDQzOS4wMDU2NyAxNDIuMzk2NTUgNDUwIDEyNS45Mzc1IEMgNDM1LjI5NDg3IDEzMi40NzQwMyA0MTkuNDgwMTggMTM2LjkwMTgzIDQwMi44NzUgMTM4Ljg3NSBDIDQxOS44MjkzMiAxMjguNzI1MTMgNDMyLjgzODI2IDExMi42NDc5MiA0MzguOTY4NzUgOTMuNDY4NzUgQyA0MjMuMTEwNiAxMDIuODc5NzEgNDA1LjU0Mzg0IDEwOS43MTk4MSAzODYuODQzNzUgMTEzLjQwNjI1IEMgMzcxLjg3ODc5IDk3LjQ1ODc4IDM1MC41NDIwNCA4Ny41IDMyNi45Mzc1IDg3LjUgQyAzMjYuMjI5NDIgODcuNSAzMjUuNTE2MjggODcuNDgyMTEzIDMyNC44MTI1IDg3LjUgeiAiIGlkPSJyZWN0Mjk4OSIgc3R5bGU9ImZpbGw6I2ZmZmZmZjtmaWxsLW9wYWNpdHk6MTtzdHJva2U6bm9uZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCw1NTIuMzYyMTgpIi8+PC9nPjwvc3ZnPg==',
        },
        {
            id: 'tb',
            name: 'Tumblr',
            icon: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiA/PjxzdmcgaGVpZ2h0PSI1MDAiIGlkPSJzdmcyIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI1MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6Y2M9Imh0dHA6Ly9jcmVhdGl2ZWNvbW1vbnMub3JnL25zIyIgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIiB4bWxuczppbmtzY2FwZT0iaHR0cDovL3d3dy5pbmtzY2FwZS5vcmcvbmFtZXNwYWNlcy9pbmtzY2FwZSIgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIiB4bWxuczpzb2RpcG9kaT0iaHR0cDovL3NvZGlwb2RpLnNvdXJjZWZvcmdlLm5ldC9EVEQvc29kaXBvZGktMC5kdGQiIHhtbG5zOnN2Zz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxkZWZzIGlkPSJkZWZzNCIvPjxnIGlkPSJsYXllcjEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKDAsLTU1Mi4zNjIxOCkiPjxnIGlkPSJsYXllcjEtOSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTU0OS4wMDUxNSw4MC4yOTQzNzIpIi8+PGcgaWQ9ImxheWVyMS02IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtNTc1LjcxNDI5LDM5Ljk5OTk5OSkiLz48ZyBpZD0ibGF5ZXIxLTEiIHRyYW5zZm9ybT0ibWF0cml4KDAuOTk5OTY3MzIsMCwwLDAuOTk5OTY3MzIsNDQ3LjY5NTk5LDI3LjU1MzI3NCkiLz48cGF0aCBkPSJtIDAsNTUyLjM2MjE2IDAsNTAwLjAwMDA0IDUwMCwwIDAsLTUwMC4wMDAwNCB6IiBpZD0icmVjdDI5ODktMSIgc3R5bGU9ImZpbGw6IzNmNWE2ZjtmaWxsLW9wYWNpdHk6MTtzdHJva2U6bm9uZSIvPjxwYXRoIGQ9Ik0gNTAwLDUwMCAyOTIuMDYwMzUsNTAwIDE5OS41MTIzMiw0MDcuNDUxOTcgMTg2LjE5NzUxLDI3MS4zNzYwOSAxMzAuNTgwMzUsMjE1Ljc1ODkzIDI2Ni41NzA5NCw1OS45NjkyNCA1MDAsMjkzLjM5ODMgeiIgaWQ9InBhdGgzMDIyIiBzdHlsZT0iZmlsbDojMDAwMDAwO3N0cm9rZTojMDAwMDAwO3N0cm9rZS13aWR0aDoxcHg7c3Ryb2tlLWxpbmVjYXA6YnV0dDtzdHJva2UtbGluZWpvaW46bWl0ZXI7c3Ryb2tlLW9wYWNpdHk6MTtvcGFjaXR5OjAuMyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCw1NTIuMzYyMTgpIi8+PHBhdGggZD0iTSAyMTIuNSA2MCBDIDIxMC4wNjc4OSA3OS41ODgxOSAyMDUuNjU3NyA5NS43MzYwODQgMTk5LjE4NzUgMTA4LjQwNjI1IEMgMTkyLjc2MzY0IDEyMS4xMDczMSAxODQuMjAxNjcgMTMxLjk4MjYgMTczLjUzMTI1IDE0MS4wNjI1IEMgMTYyLjkwNzE2IDE1MC4xMTE1MiAxNDUuNjEyMTggMTU3LjAzMzk0IDEzMC42ODc1IDE2MS44NzUgTCAxMzAuNjg3NSAyMTUuNzE4NzUgTCAxODIuMzEyNSAyMTUuNzE4NzUgTCAxODIuMzEyNSAzNDguOTY4NzUgQyAxODIuMzEyNSAzNjYuMzQxMDEgMTg0LjEyOTIxIDM3OS42MjQxMyAxODcuNzgxMjUgMzg4Ljc4MTI1IEMgMTkxLjQyNTU1IDM5Ny45MTUxOSAxOTcuOTQ4MDQgNDA2LjUyNjA0IDIwNy40MDYyNSA0MTQuNjU2MjUgQyAyMTYuODE4MTYgNDIyLjcyNDY5IDIyOC4yMDUxNiA0MjkuMDIxMDggMjQxLjU2MjUgNDMzLjQzNzUgQyAyNTQuODk2NjcgNDM3Ljc5OTg3IDI2NS4xNTkgNDQwIDI4Mi41MzEyNSA0NDAgQyAyOTcuODM0MjYgNDQwIDMxMi4wMzg5OSA0MzguNDMyNTEgMzI1LjIxODc1IDQzNS4zNzUgQyAzMzguMzgzMDUgNDMyLjMxNzQ4IDM1My4wOTgzOSA0MjYuOTI1MDIgMzY5LjMxMjUgNDE5LjI4MTI1IEwgMzY5LjMxMjUgMzU5LjM3NSBDIDM1MC4yODAyMyAzNzEuODc1MyAzMzEuMTQ3IDM3OC4xMjUgMzExLjkwNjI1IDM3OC4xMjUgQyAzMDEuMDgxNCAzNzguMTI1IDI5MS40OTM4NCAzNzUuNjEyMDMgMjgzLjA2MjUgMzcwLjU2MjUgQyAyNzYuNzMxMjkgMzY2Ljg0MDk3IDI3MC45MTc3NiAzNjAuMzcxNjQgMjY4LjU5Mzc1IDM1NC4xNTYyNSBDIDI2Ni4yNjk3MyAzNDcuOTA5OTUgMjY2LjUzMTI1IDMzNS4xOTk3MSAyNjYuNTMxMjUgMzEzLjE1NjI1IEwgMjY2LjUzMTI1IDIxNS43MTg3NSBMIDM1NC40MDYyNSAyMTUuNzE4NzUgTCAzNTQuNDA2MjUgMTQ3Ljg3NSBMIDI2Ni41MzEyNSAxNDcuODc1IEwgMjY2LjUzMTI1IDYwIEwgMjEyLjUgNjAgeiAiIGlkPSJyZWN0Mjk4OSIgc3R5bGU9ImZpbGw6I2ZmZmZmZjtmaWxsLW9wYWNpdHk6MTtzdHJva2U6bm9uZSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCw1NTIuMzYyMTgpIi8+PC9nPjwvc3ZnPg==',
        },
    ];

    return Cliche.extend({
        pug: pug,
        options: {
            title: '',
            desc: '',
            img: null,
            linkPage: null,
            linkSocial: null,
            linkObject: null,
        },
        create: function () {
            const self = this;

            this.auth = globalVM.repository['m/common/auth'];
            this.socials = socials;

            socials.forEach(function (social) {
                social.action = function (data, evt) {
                    self.share(social.id, data, evt);
                };
            });

            this.show();
        },
        show: function () {
            ga('send', 'event', 'share', 'open', 'share open');

            ko.applyBindings(globalVM, this.$dom[0]);
            globalVM.func.showContainer(this.$container);

            if (this.modal) {
                this.modal.$curtain.addClass('showModalCurtain');
            }

            this.showing = true;
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        copyClick: function (data, evt) {
            evt.target.previousSibling.click();
        },
        linkClick: function (data, evt) {
            const input = evt.target;

            if (input) {
                Utils.copyTextToClipboard(input.value);
                input.select();
            }
        },
        share: function (network) {
            let url;
            const origin = location.origin || location.protocol + '://' + location.host;
            const options = this.options;
            const pageUrlOrigin = options.linkSocial ? origin + options.linkSocial : document.URL;
            const pageUrl = encodeURIComponent(pageUrlOrigin);
            let pageTitle = options.title;
            const pageDesc = options.desc;
            const image = options.img ? origin + options.img : null;
            const popup = function (url) {
                return Utils.popupCenter(url, '', 640, 480);
            };

            if (network === 'fb') {
                popup('https://www.facebook.com/sharer/sharer.php?u=' + pageUrl);
            } else if (network === 'vk') {
                url = 'http://vkontakte.ru/share.php?url=' + pageUrl + '&noparse=';

                if (pageTitle && image) {
                    url += 'true&title=' + encodeURIComponent(pageTitle) + '&image=' + encodeURIComponent(image);

                    if (pageDesc) {
                        url += '&description=' + encodeURIComponent(pageDesc);
                    }
                } else {
                    url += 'false';
                }

                popup(url);
            } else if (network === 'ok') {
                url = 'http://www.odnoklassniki.ru/dk?st.cmd=addShare';
                url += '&st.comments=' + encodeURIComponent('PastVu');
                url += '&st._surl=' + pageUrl;

                popup(url);
            } else if (network === 'tb') {
                if (image) {
                    url = 'https://www.tumblr.com/widgets/share/tool?posttype=photo&content=' + image +
                        '&canonicalUrl=' + pageUrl;

                    if (pageTitle) {
                        url += '&caption=' + encodeURIComponent(pageTitle);
                    }
                } else {
                    url = 'https://www.tumblr.com/widgets/share/tool?posttype=link&content=' + encodeURIComponent(pageTitle) +
                        '&canonicalUrl=' + pageUrl +
                        '&title=' + encodeURIComponent(pageTitle) + '&caption=' + encodeURIComponent(pageDesc);
                }

                popup(url);
            } else if (network === 'tw') {
                const _window = popup('');
                const maxLength = 280 - 6 - 23; // 23 is reserved for any length link

                if (pageTitle.length > maxLength) {
                    pageTitle = pageTitle.substr(0, maxLength) + '...';
                }

                _window.location = 'http://twitter.com/share?text=' + encodeURIComponent(pageTitle) +
                    '&url=' + pageUrl +
                    '&counturl=' + pageUrl;
            }

            ga('send', 'event', 'share', network, 'share network click');
        },
    });
});
