# PastVu
![GitHub package.json version](https://img.shields.io/github/package-json/v/pastvu/pastvu)
[![Node.js CI](https://github.com/PastVu/pastvu/actions/workflows/node.js.yml/badge.svg)](https://github.com/PastVu/pastvu/actions/workflows/node.js.yml)
[![Docker Image CI](https://github.com/PastVu/pastvu/actions/workflows/docker-image.yml/badge.svg)](https://github.com/PastVu/pastvu/actions/workflows/docker-image.yml)

[PastVu](https://pastvu.com/) is an online platform for gathering, geo-tagging, attributing and discussing retro photos. A look at the history of humanity habitat.

## History

This project was started in 2009 by Ilya Varlamov and Alexey Duk. Initially it
was dedicated to historical photos of Moscow (oldmos.ru). As community was
growing, soon a second site for historical photos of St. Petersburg was
created (oldsp.ru). In 2013 two projects were merged and migrated into global
scope platform PastVu. Principal maintainer and software architect of the new
platform became [Pavel Klimashkin](https://github.com/klimashkin). In 2020 the
project code [became](https://pastvu.com/news/149) open source, this attracted more
people to participate and contribute. Over the years, many people have
uploaded, attributed and geo-located images (photographs, paintings,
drawings), with support and leading by regional and global moderators and
administrators team.

## Technology

The project is built using JavaScript stack containing components:
* [MongoDB](https://www.mongodb.com/) database and [Redis](https://redis.io/) for runtime data storage
* [Node.js](https://nodejs.org/en/) with [Express](https://expressjs.com) web application framework at back-end
* [Socket.IO](https://socket.io/) provides realtime client-server communication
* [Pug](https://pugjs.org) is a template engine
* [Knockout](https://knockoutjs.com/) client-side library is implementing MVVM architecture pattern
* [Leaflet](https://leafletjs.com/) is used for maps display and interaction

Other dependencies can be found at `package.json` and `public/js/lib/`.

We are using GitHub tools for CI/CD pipeline and release management.

## Documentation

PastVu documentation is located at the dedicated project: https://docs.pastvu.com/en/

All development and communication for this documentation resources takes place in [docs repository](https://github.com/PastVu/docs). We also welcome contributing to documentation, please read [Improve docs](https://docs.pastvu.com/en/contributing/docs) for details.

## Contributing

We are grateful to the PastVu users community for adding photos and discussing
them, helping to identify locations, improving information accuracy, taking
resposibility by moderating uploaded content.

Our [contributing guidance](https://docs.pastvu.com/en/contributing) contains more information how one can participate in the project including help with [development](https://docs.pastvu.com/en/contributing#development).

We expect all project participants to follow [Contributor Code of Conduct](CODE_OF_CONDUCT.md)

## License

* GNU Affero General Public License (AGPL) v3 or later. See [COPYING](https://github.com/pastvu/pastvu/blob/master/COPYING) for the full license text.
* Test database used for development setup is licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/summary/), geographic and adminstrative boundaries data it contains: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

