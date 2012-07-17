=================
twitter-searchite
=================

Quick creation of sites driven by polling a Twitter search, using `Node.js`_
and `Redis`_.

.. _`Node.js`: http://nodejs.org/
.. _`Redis`: http://redis.io

Usage
=====

#. Clone the repo.

#. ``npm install`` to install dependencies.

#. Edit `settings.js`_.

#. Start ``redis-server``.

#. ``node server.js`` to start polling for Tweets and serve up a site which uses
   the Tweets.

#. Hack.

.. _`settings.js`: https://github.com/insin/twitter-searchite/blob/master/settings.js
.. _`Search API`: https://dev.twitter.com/docs/api/1/get/search

MIT License
===========

Copyright (c) 2012, Jonathan Buchanan

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
