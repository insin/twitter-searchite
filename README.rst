=================
twitter-searchite
=================

Quick creation of sites driven by polling a Twitter search.

Usage
=====

1. Clone the repo.

2. Edit `settings.js`_.

   If you have keys for a Twitter app you want to use, plug 'em in, but the
   Twitter `Search API`_ doesn't require authentication.

   Add the search text you want to use to the search setting.

3. Start `Redis`_.

4. Run ``node poller.js`` to start polling for Tweets.

5. Run ``node server.js`` to serve up a site which uses the Tweets.

6. Hack.

.. _`settings.js`: https://github.com/insin/twitter-searchite/blob/master/settings.js
.. _`Search API`: https://dev.twitter.com/docs/api/1/get/search
.. _`Redis`: http://redis.io

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
